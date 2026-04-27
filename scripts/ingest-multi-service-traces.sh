#!/usr/bin/env bash
set -euo pipefail

QUICKWIT_URL="${QUICKWIT_URL:-http://127.0.0.1:7280/api/v1}"
INDEX="${INDEX:-otel-traces-v0_9}"
LOG_INDEX="${LOG_INDEX:-otel-logs-v0_9}"
INGEST_LOGS="${INGEST_LOGS:-1}"

now_ns() {
  date +%s%N
}

new_trace_id() {
  printf '%s-%s' "$1" "$(now_ns)" | sha256sum | awk '{print substr($1, 1, 32)}'
}

TRACE_ID="${TRACE_ID:-$(new_trace_id healthy)}"
ERROR_TRACE_ID="${ERROR_TRACE_ID:-$(new_trace_id error)}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

span_doc() {
  local trace_id="$1"
  local span_id="$2"
  local parent_span_id="$3"
  local service_name="$4"
  local span_name="$5"
  local span_kind="$6"
  local start_ns="$7"
  local duration_ms="$8"
  local status_code="$9"
  local status_message="${10}"
  local route="${11}"
  local method="${12}"
  local component="${13}"
  local peer_service_name="${14:-}"

  local end_ns=$((start_ns + duration_ms * 1000000))
  local parent_field=""
  local peer_service_attr=""
  local is_root="false"
  local status='{}'
  local event_one_name="span.work.started"
  local event_two_name="span.work.completed"
  local event_status="ok"
  local escaped_component
  local escaped_method
  local escaped_route
  escaped_component="$(json_escape "${component}")"
  escaped_method="$(json_escape "${method}")"
  escaped_route="$(json_escape "${route}")"

  if [[ -n "${parent_span_id}" ]]; then
    parent_field=",\"parent_span_id\":\"${parent_span_id}\""
  else
    is_root="true"
  fi

  if [[ -n "${peer_service_name}" ]]; then
    peer_service_attr=",\"service.peer.name\":\"$(json_escape "${peer_service_name}")\""
  fi

  if [[ -n "${status_code}" ]]; then
    status="{\"code\":\"${status_code}\",\"message\":\"$(json_escape "${status_message}")\"}"
  fi

  case "${component}" in
    http)
      event_one_name="http.request.received"
      event_two_name="http.response.sent"
      ;;
    grpc)
      event_one_name="rpc.client.request"
      event_two_name="rpc.client.response"
      ;;
    db)
      event_one_name="db.statement.prepared"
      event_two_name="db.statement.completed"
      ;;
    queue)
      event_one_name="messaging.message.created"
      event_two_name="messaging.message.sent"
      ;;
  esac

  if [[ "${status_code}" == "ERROR" ]]; then
    event_status="error"
  fi

  local event_one_ts=$((start_ns + duration_ms * 150000))
  local event_two_ts=$((start_ns + duration_ms * 850000))
  local event_names="[\"${event_one_name}\",\"${event_two_name}\"]"
  local events
  printf -v events '[{"event_name":"%s","event_timestamp_nanos":%s,"event_attributes":{"component":"%s","route":"%s","method":"%s","status":"started"}},{"event_name":"%s","event_timestamp_nanos":%s,"event_attributes":{"component":"%s","route":"%s","method":"%s","status":"%s","duration_ms":%s}}]' \
    "${event_one_name}" \
    "${event_one_ts}" \
    "${escaped_component}" \
    "${escaped_route}" \
    "${escaped_method}" \
    "${event_two_name}" \
    "${event_two_ts}" \
    "${escaped_component}" \
    "${escaped_route}" \
    "${escaped_method}" \
    "${event_status}" \
    "${duration_ms}"

  if [[ "${status_code}" == "ERROR" ]]; then
    event_names="[\"${event_one_name}\",\"${event_two_name}\",\"exception\"]"
    events="${events%]},"'{"event_name":"exception","event_timestamp_nanos":'"$((start_ns + duration_ms * 500000))"',"event_attributes":{"exception.type":"SyntheticFailure","exception.message":"'"$(json_escape "${status_message}")"'","exception.stacktrace":"SyntheticFailure: '"$(json_escape "${status_message}")"'\\n    at quickwitFixture.checkout\\n    at quickwitFixture.payment"}}'"]"
  fi

  printf '{"trace_id":"%s","span_id":"%s"%s,"is_root":%s,"service_name":"%s","resource_attributes":{"service.name":"%s","service.namespace":"demo-shop","deployment.environment":"local","service.version":"dev"},"scope_name":"quickwit-datasource-fixture","scope_version":"0.1.0","span_kind":%s,"span_name":"%s","span_fingerprint":"%s\\u0000%s\\u0000%s","span_start_timestamp_nanos":%s,"span_end_timestamp_nanos":%s,"span_duration_millis":%s,"span_attributes":{"http.route":"%s","http.method":"%s","component":"%s","fixture":"multi-service-trace"%s},"span_status":%s,"event_names":%s,"events":%s,"links":[]}\n' \
    "${trace_id}" \
    "${span_id}" \
    "${parent_field}" \
    "${is_root}" \
    "$(json_escape "${service_name}")" \
    "$(json_escape "${service_name}")" \
    "${span_kind}" \
    "$(json_escape "${span_name}")" \
    "$(json_escape "${service_name}")" \
    "${span_kind}" \
    "$(json_escape "${span_name}")" \
    "${start_ns}" \
    "${end_ns}" \
    "${duration_ms}" \
    "$(json_escape "${route}")" \
    "$(json_escape "${method}")" \
    "$(json_escape "${component}")" \
    "${peer_service_attr}" \
    "${status}" \
    "${event_names}" \
    "${events}"
}

log_doc() {
  local trace_id="$1"
  local span_id="$2"
  local service_name="$3"
  local span_name="$4"
  local timestamp_ns="$5"
  local severity_text="$6"
  local severity_number="$7"
  local message="$8"
  local route="$9"
  local method="${10}"

  printf '{"timestamp_nanos":%s,"observed_timestamp_nanos":%s,"service_name":"%s","severity_text":"%s","severity_number":%s,"body":{"message":"%s"},"attributes":{"http.route":"%s","http.method":"%s","span.name":"%s","fixture":"multi-service-trace"},"dropped_attributes_count":0,"trace_id":"%s","span_id":"%s","trace_flags":1,"resource_attributes":{"service.name":"%s","service.namespace":"demo-shop","deployment.environment":"local","service.version":"dev"},"resource_dropped_attributes_count":0,"scope_name":"quickwit-datasource-fixture","scope_version":"0.1.0","scope_attributes":{},"scope_dropped_attributes_count":0}\n' \
    "${timestamp_ns}" \
    "${timestamp_ns}" \
    "$(json_escape "${service_name}")" \
    "$(json_escape "${severity_text}")" \
    "${severity_number}" \
    "$(json_escape "${message}")" \
    "$(json_escape "${route}")" \
    "$(json_escape "${method}")" \
    "$(json_escape "${span_name}")" \
    "${trace_id}" \
    "${span_id}" \
    "$(json_escape "${service_name}")"
}

base_ns="$(now_ns)"
trace_tmp_file="$(mktemp)"
log_tmp_file="$(mktemp)"
trap 'rm -f "${trace_tmp_file}" "${log_tmp_file}"' EXIT

{
  span_doc "${TRACE_ID}" "1111111111111111" ""                 "web-frontend"       "GET /checkout"             2 "${base_ns}"              420 ""      ""                         "/checkout"             "GET"  "http"
  span_doc "${TRACE_ID}" "2222222222222222" "1111111111111111" "checkout-api"       "POST /api/checkout"        3 "$((base_ns +  35 * 1000000))" 310 ""      ""                         "/api/checkout"         "POST" "http"
  span_doc "${TRACE_ID}" "3333333333333333" "2222222222222222" "inventory-service"  "Reserve inventory"         3 "$((base_ns +  80 * 1000000))"  85 ""      ""                         "inventory.reserve"     "RPC"  "grpc" "warehouse-system"
  span_doc "${TRACE_ID}" "4444444444444444" "2222222222222222" "payment-service"    "Authorize payment"         3 "$((base_ns + 145 * 1000000))" 135 ""      ""                         "payment.authorize"     "RPC"  "grpc"
  span_doc "${TRACE_ID}" "5555555555555555" "4444444444444444" "postgres-payments"  "UPDATE payment_intents"    3 "$((base_ns + 175 * 1000000))"  42 ""      ""                         "payment_intents"       "SQL"  "db"
  span_doc "${TRACE_ID}" "6666666666666666" "2222222222222222" "email-service"      "Send confirmation email"   4 "$((base_ns + 265 * 1000000))"  55 ""      ""                         "email.confirmation"    "RPC"  "queue"

  error_base_ns=$((base_ns + 2 * 1000000000))
  span_doc "${ERROR_TRACE_ID}" "aaaaaaaaaaaaaaaa" ""                 "web-frontend"      "GET /checkout"             2 "${error_base_ns}"             690 "ERROR" "checkout failed"             "/checkout"             "GET"  "http"
  span_doc "${ERROR_TRACE_ID}" "bbbbbbbbbbbbbbbb" "aaaaaaaaaaaaaaaa" "checkout-api"      "POST /api/checkout"        3 "$((error_base_ns +  40 * 1000000))" 610 "ERROR" "payment authorization failed" "/api/checkout"         "POST" "http"
  span_doc "${ERROR_TRACE_ID}" "cccccccccccccccc" "bbbbbbbbbbbbbbbb" "payment-service"   "Authorize payment"         3 "$((error_base_ns + 105 * 1000000))" 470 "ERROR" "card declined"                "payment.authorize"     "RPC"  "grpc"
  span_doc "${ERROR_TRACE_ID}" "dddddddddddddddd" "cccccccccccccccc" "fraud-service"     "Score transaction risk"    3 "$((error_base_ns + 150 * 1000000))" 145 ""      ""                         "fraud.score"           "RPC"  "grpc" "risk-engine"
  span_doc "${ERROR_TRACE_ID}" "eeeeeeeeeeeeeeee" "cccccccccccccccc" "postgres-payments" "SELECT payment_method"     3 "$((error_base_ns + 350 * 1000000))"  70 ""      ""                         "payment_methods"       "SQL"  "db"
} > "${trace_tmp_file}"

curl -fsS "${QUICKWIT_URL}/${INDEX}/ingest?commit=wait_for" \
  -H 'Content-Type: application/json' \
  --data-binary "@${trace_tmp_file}"

if [[ "${INGEST_LOGS}" == "1" ]]; then
  {
    log_doc "${TRACE_ID}" "1111111111111111" "web-frontend"      "GET /checkout"           "$((base_ns +  40 * 1000000))" "INFO"  9  "checkout page requested"         "/checkout"          "GET"
    log_doc "${TRACE_ID}" "2222222222222222" "checkout-api"      "POST /api/checkout"      "$((base_ns +  90 * 1000000))" "INFO"  9  "checkout request accepted"       "/api/checkout"      "POST"
    log_doc "${TRACE_ID}" "3333333333333333" "inventory-service" "Reserve inventory"       "$((base_ns + 120 * 1000000))" "INFO"  9  "inventory reserved"              "inventory.reserve"  "RPC"
    log_doc "${TRACE_ID}" "4444444444444444" "payment-service"   "Authorize payment"       "$((base_ns + 210 * 1000000))" "INFO"  9  "payment authorization approved"  "payment.authorize"  "RPC"
    log_doc "${TRACE_ID}" "5555555555555555" "postgres-payments" "UPDATE payment_intents"  "$((base_ns + 198 * 1000000))" "INFO"  9  "payment intent updated"          "payment_intents"    "SQL"
    log_doc "${TRACE_ID}" "6666666666666666" "email-service"     "Send confirmation email" "$((base_ns + 285 * 1000000))" "INFO"  9  "confirmation email queued"       "email.confirmation" "RPC"

    log_doc "${ERROR_TRACE_ID}" "aaaaaaaaaaaaaaaa" "web-frontend"      "GET /checkout"         "$((error_base_ns +  80 * 1000000))" "ERROR" 17 "checkout failed"                         "/checkout"          "GET"
    log_doc "${ERROR_TRACE_ID}" "bbbbbbbbbbbbbbbb" "checkout-api"      "POST /api/checkout"    "$((error_base_ns + 130 * 1000000))" "ERROR" 17 "payment authorization failed"            "/api/checkout"      "POST"
    log_doc "${ERROR_TRACE_ID}" "cccccccccccccccc" "payment-service"   "Authorize payment"     "$((error_base_ns + 250 * 1000000))" "ERROR" 17 "card declined by synthetic fixture"      "payment.authorize"  "RPC"
    log_doc "${ERROR_TRACE_ID}" "dddddddddddddddd" "fraud-service"     "Score transaction risk" "$((error_base_ns + 205 * 1000000))" "INFO"  9  "fraud risk score calculated"              "fraud.score"        "RPC"
    log_doc "${ERROR_TRACE_ID}" "eeeeeeeeeeeeeeee" "postgres-payments" "SELECT payment_method" "$((error_base_ns + 380 * 1000000))" "INFO"  9  "payment method lookup completed"          "payment_methods"    "SQL"
  } > "${log_tmp_file}"

  curl -fsS "${QUICKWIT_URL}/${LOG_INDEX}/ingest?commit=wait_for" \
    -H 'Content-Type: application/json' \
    --data-binary "@${log_tmp_file}"
fi

printf 'Ingested multi-service trace fixtures into %s/%s\n' "${QUICKWIT_URL}" "${INDEX}"
if [[ "${INGEST_LOGS}" == "1" ]]; then
  printf 'Ingested correlated log fixtures into %s/%s\n' "${QUICKWIT_URL}" "${LOG_INDEX}"
fi
printf 'Healthy trace: %s\n' "${TRACE_ID}"
printf 'Error trace:   %s\n' "${ERROR_TRACE_ID}"
