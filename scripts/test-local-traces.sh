#!/usr/bin/env bash
set -euo pipefail

QUICKWIT_URL="${QUICKWIT_URL:-http://127.0.0.1:7280/api/v1}"
GRAFANA_URL="${GRAFANA_URL:-http://127.0.0.1:3000}"
GRAFANA_USER="${GRAFANA_USER:-admin}"
GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-admin}"
LOGS_DATASOURCE_NAME="${LOGS_DATASOURCE_NAME:-Quickwit}"
TRACES_DATASOURCE_NAME="${TRACES_DATASOURCE_NAME:-Quickwit Traces}"

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "${cmd}" >&2
    exit 1
  fi
}

new_trace_id() {
  printf '%s-%s' "$1" "$(date +%s%N)" | sha256sum | awk '{print substr($1, 1, 32)}'
}

wait_for_grafana() {
  local attempts=30
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl -fsS -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" "${GRAFANA_URL}/api/health" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  printf 'Grafana did not become ready at %s\n' "${GRAFANA_URL}" >&2
  return 1
}

query_grafana() {
  local datasource_uid="$1"
  local query="$2"
  local metrics_json="$3"
  local bucket_aggs_json="${4:-[]}"

  local body
  body="$(
    jq -nc \
      --arg uid "${datasource_uid}" \
      --arg query "${query}" \
      --argjson metrics "${metrics_json}" \
      --argjson bucketAggs "${bucket_aggs_json}" \
      '{
        from: "now-15m",
        to: "now",
        queries: [
          {
            refId: "A",
            datasource: { type: "quickwit-quickwit-datasource", uid: $uid },
            query: $query,
            bucketAggs: $bucketAggs,
            metrics: $metrics,
            maxDataPoints: 1000,
            intervalMs: 1000
          }
        ]
      }'
  )"

  curl -fsS \
    -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
    -H 'Content-Type: application/json' \
    --data "${body}" \
    "${GRAFANA_URL}/api/ds/query"
}

assert_jq() {
  local json="$1"
  local filter="$2"
  local message="$3"

  if ! jq -e "${filter}" >/dev/null <<<"${json}"; then
    printf 'Assertion failed: %s\n' "${message}" >&2
    jq '.' <<<"${json}" >&2
    exit 1
  fi
}

assert_jq_arg() {
  local json="$1"
  local arg_name="$2"
  local arg_value="$3"
  local filter="$4"
  local message="$5"

  if ! jq -e --arg "${arg_name}" "${arg_value}" "${filter}" >/dev/null <<<"${json}"; then
    printf 'Assertion failed: %s\n' "${message}" >&2
    jq '.' <<<"${json}" >&2
    exit 1
  fi
}

value_for_trace() {
  local json="$1"
  local trace_id="$2"
  local column_index="$3"

  jq -r \
    --arg traceId "${trace_id}" \
    --argjson columnIndex "${column_index}" \
    '.results.A.frames[0].data.values[0] as $traceIds
      | ($traceIds | index($traceId)) as $idx
      | .results.A.frames[0].data.values[$columnIndex][$idx]' \
    <<<"${json}"
}

require_cmd curl
require_cmd jq
require_cmd sha256sum
require_cmd awk

TRACE_ID="${TRACE_ID:-$(new_trace_id healthy-local-trace-test)}"
ERROR_TRACE_ID="${ERROR_TRACE_ID:-$(new_trace_id error-local-trace-test)}"

printf 'Checking Grafana at %s\n' "${GRAFANA_URL}"
wait_for_grafana

datasources="$(
  curl -fsS -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" "${GRAFANA_URL}/api/datasources"
)"

logs_uid="$(
  jq -r --arg name "${LOGS_DATASOURCE_NAME}" \
    '.[] | select(.name == $name and .type == "quickwit-quickwit-datasource") | .uid' \
    <<<"${datasources}" | head -n 1
)"
traces_uid="$(
  jq -r --arg name "${TRACES_DATASOURCE_NAME}" \
    '.[] | select(.name == $name and .type == "quickwit-quickwit-datasource") | .uid' \
    <<<"${datasources}" | head -n 1
)"

if [[ -z "${logs_uid}" || "${logs_uid}" == "null" ]]; then
  printf 'Could not find logs datasource named %s\n' "${LOGS_DATASOURCE_NAME}" >&2
  exit 1
fi
if [[ -z "${traces_uid}" || "${traces_uid}" == "null" ]]; then
  printf 'Could not find traces datasource named %s\n' "${TRACES_DATASOURCE_NAME}" >&2
  exit 1
fi

printf 'Using logs datasource %s and traces datasource %s\n' "${logs_uid}" "${traces_uid}"
printf 'Ingesting fixture traces into %s\n' "${QUICKWIT_URL}"
TRACE_ID="${TRACE_ID}" ERROR_TRACE_ID="${ERROR_TRACE_ID}" QUICKWIT_URL="${QUICKWIT_URL}" \
  ./scripts/ingest-multi-service-traces.sh >/dev/null

trace_search_response="$(
  query_grafana \
    "${traces_uid}" \
    "span_attributes.fixture:multi-service-trace AND (trace_id:${TRACE_ID} OR trace_id:${ERROR_TRACE_ID})" \
    '[{"id":"1","type":"trace_search","settings":{"limit":"20","spanLimit":"200"}}]'
)"

assert_jq "${trace_search_response}" '.results.A.status == 200' 'trace search query returned HTTP 200'
assert_jq "${trace_search_response}" '.results.A.frames[0].schema.meta.preferredVisualisationType == "table"' 'trace search frame is a table'
assert_jq_arg "${trace_search_response}" traceId "${TRACE_ID}" '.results.A.frames[0].data.values[0] | index($traceId) != null' 'healthy trace appears in trace search'
assert_jq_arg "${trace_search_response}" traceId "${ERROR_TRACE_ID}" '.results.A.frames[0].data.values[0] | index($traceId) != null' 'error trace appears in trace search'
assert_jq "${trace_search_response}" '.results.A.frames[0].schema.fields[0].config.links[0].title == "Open trace"' 'trace search exposes Open trace link'
assert_jq "${trace_search_response}" '.results.A.frames[0].schema.fields[0].config.links[0].internal.query.queryType == "traces"' 'trace search link targets the traces query type'
assert_jq "${trace_search_response}" '.results.A.frames[0].schema.fields[0].config.links[0].internal.query.datasource.uid == .results.A.frames[0].schema.fields[0].config.links[0].internal.datasourceUid' 'trace search link embeds its datasource in the target query'

healthy_spans="$(value_for_trace "${trace_search_response}" "${TRACE_ID}" 3)"
error_spans="$(value_for_trace "${trace_search_response}" "${ERROR_TRACE_ID}" 3)"
error_count="$(value_for_trace "${trace_search_response}" "${ERROR_TRACE_ID}" 8)"

if [[ "${healthy_spans}" != "6" || "${error_spans}" != "5" || "${error_count}" != "3" ]]; then
  printf 'Unexpected trace search summary: healthy_spans=%s error_spans=%s error_count=%s\n' \
    "${healthy_spans}" "${error_spans}" "${error_count}" >&2
  exit 1
fi

trace_response="$(
  query_grafana \
    "${traces_uid}" \
    "trace_id:${ERROR_TRACE_ID}" \
    '[{"id":"1","type":"traces","settings":{"limit":"1000"}}]'
)"

assert_jq "${trace_response}" '.results.A.status == 200' 'full trace query returned HTTP 200'
assert_jq "${trace_response}" '.results.A.frames[0].schema.meta.preferredVisualisationType == "trace"' 'full trace frame is a trace'
assert_jq "${trace_response}" '.results.A.frames[0].data.values[0] | length == 5' 'error trace has five spans'
assert_jq "${trace_response}" '.results.A.frames[0].schema.fields[1].config.links[0].title == "Logs for span"' 'trace spans expose Logs for span link'
assert_jq "${trace_response}" '.results.A.frames[0].schema.fields[1].config.links[0].internal.query.queryType == "logs"' 'span log link targets the logs query type'
assert_jq "${trace_response}" '.results.A.frames[0].schema.fields[1].config.links[0].internal.query.datasource.uid == .results.A.frames[0].schema.fields[1].config.links[0].internal.datasourceUid' 'span log link embeds its datasource in the target query'
assert_jq "${trace_response}" '.results.A.frames[1].schema.meta.preferredVisualisationType == "nodeGraph"' 'nodes frame is a node graph'
assert_jq "${trace_response}" '.results.A.frames[1].data.values[0] | length == 5' 'node graph has five service nodes'
assert_jq "${trace_response}" '.results.A.frames[2].data.values[0] | length == 4' 'node graph has four service edges'
assert_jq "${trace_response}" '.results.A.frames[0].data.values[12] | map(select(. == 2)) | length == 3' 'full trace marks three error spans'

exemplar_link_response="$(
  query_grafana \
    "${traces_uid}" \
    "${ERROR_TRACE_ID}" \
    '[{"id":"3","type":"logs","settings":{"limit":"100"}}]'
)"

assert_jq "${exemplar_link_response}" '.results.A.status == 200' 'exemplar-style internal link query returned HTTP 200'
assert_jq "${exemplar_link_response}" '.results.A.frames[0].schema.meta.preferredVisualisationType == "trace"' 'exemplar-style internal link opens a trace frame'
assert_jq "${exemplar_link_response}" '.results.A.frames[0].data.values[0] | length == 5' 'exemplar-style internal link resolves the bare trace id'

logs_response="$(
  query_grafana \
    "${logs_uid}" \
    "trace_id:${ERROR_TRACE_ID} AND span_id:cccccccccccccccc" \
    '[{"id":"1","type":"logs","settings":{"limit":"100"}}]'
)"

assert_jq "${logs_response}" '.results.A.status == 200' 'logs query returned HTTP 200'
assert_jq "${logs_response}" '.results.A.frames[0].schema.meta.preferredVisualisationType == "logs"' 'correlated logs frame is a logs frame'
assert_jq "${logs_response}" '.results.A.frames[0] as $frame
  | ($frame.schema.fields | map(.name) | index("body.message")) as $messageField
  | $frame.data.values[$messageField][0] == "card declined by synthetic fixture"' 'span log correlation returns the expected log line'

metrics_response="$(
  query_grafana \
    "${traces_uid}" \
    "span_attributes.fixture:multi-service-trace AND trace_id:${ERROR_TRACE_ID}" \
    '[{"id":"1","type":"count"}]' \
    '[{"id":"2","type":"date_histogram","settings":{"interval":"1s","min_doc_count":"1"}}]'
)"

assert_jq "${metrics_response}" '.results.A.status == 200' 'metric query returned HTTP 200'
assert_jq "${metrics_response}" '.results.A.frames[0].schema.meta.type == "timeseries-multi"' 'metric query returns a time series'
assert_jq "${metrics_response}" '.results.A.frames[0].data.values[1] | add == 5' 'metric count over the error trace returns five spans'

printf 'Local trace validation passed.\n'
printf 'Healthy trace: %s (%s spans)\n' "${TRACE_ID}" "${healthy_spans}"
printf 'Error trace:   %s (%s spans, %s error spans)\n' "${ERROR_TRACE_ID}" "${error_spans}" "${error_count}"
