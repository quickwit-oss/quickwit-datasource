package quickwit

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/stretchr/testify/require"

	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
)

func TestProcessTracesResponse(t *testing.T) {
	query := []byte(`
		[
			{
				"refId": "A",
				"metrics": [{ "type": "traces", "id": "1", "settings": { "limit": "1000" } }],
				"query": "trace_id:3c191d03fa8be0653c191d03fa8be065"
			}
		]
	`)

	response := []byte(`
		{
			"responses": [
				{
					"hits": {
						"hits": [
							{
								"_source": {
									"trace_id": "3c191d03fa8be0653c191d03fa8be065",
									"span_id": "1111111111111111",
									"parent_span_id": "",
									"service_name": "checkout",
									"resource_attributes": {
										"host.name": "node-1",
										"service.namespace": "prod"
									},
									"span_name": "GET /checkout",
									"span_start_timestamp_nanos": 1678974011000000000,
									"span_end_timestamp_nanos": 1678974011100000000,
									"span_duration_millis": 100,
									"span_attributes": {
										"http.method": "GET",
										"http.status_code": 200
									},
									"events": [
										{
											"event_name": "exception",
											"event_timestamp_nanos": 1678974011050000000,
											"event_attributes": {
												"exception.type": "panic"
											}
										}
									],
									"links": [
										{
											"trace_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
											"span_id": "2222222222222222",
											"attributes": {
												"link.type": "follows_from"
											}
										}
									]
								}
							},
							{
								"_source": {
									"trace_id": "3c191d03fa8be0653c191d03fa8be065",
									"span_id": "3333333333333333",
									"parent_span_id": "1111111111111111",
									"service_name": "payments",
									"resource_attributes": {
										"host.name": "node-2"
									},
									"span_name": "POST /charge",
									"span_start_timestamp_nanos": 1678974011020000000,
									"span_duration_millis": 25,
									"span_status": { "code": "ERROR", "message": "declined" },
									"span_attributes": {
										"db.system": "postgresql",
										"service.peer.name": "stripe-api",
										"exception.stacktrace": "SyntheticFailure: declined\n    at authorizePayment"
									}
								}
							}
						]
					}
				}
			]
		}
	`)

	result, err := queryDataTest(query, response)
	require.NoError(t, err)

	require.Len(t, result.response.Responses, 1)
	frames := result.response.Responses["A"].Frames
	require.Len(t, frames, 3)

	traceFrame := frames[0]
	require.Equal(t, data.VisTypeTrace, string(traceFrame.Meta.PreferredVisualization))

	fields := make(map[string]*data.Field)
	for _, field := range traceFrame.Fields {
		fields[field.Name] = field
	}

	require.Equal(t, "3c191d03fa8be0653c191d03fa8be065", fields["traceID"].At(0))
	require.Equal(t, "1111111111111111", fields["spanID"].At(0))
	require.Nil(t, fields["parentSpanID"].At(0))
	require.Equal(t, "1111111111111111", *fields["parentSpanID"].At(1).(*string))
	require.Equal(t, "GET /checkout", fields["operationName"].At(0))
	require.Equal(t, "checkout", fields["serviceName"].At(0))
	require.InDelta(t, 1678974011000.0, fields["startTime"].At(0).(float64), 0.01)
	require.Equal(t, 100.0, fields["duration"].At(0))
	require.Equal(t, int64(0), fields["statusCode"].At(0))
	require.Equal(t, int64(2), fields["statusCode"].At(1))
	require.Equal(t, "declined", fields["statusMessage"].At(1))
	require.Equal(t, "red", fields["errorIconColor"].At(1))

	serviceTags := string(fields["serviceTags"].At(0).(json.RawMessage))
	require.Contains(t, serviceTags, `"key":"host.name"`)
	require.Contains(t, serviceTags, `"value":"node-1"`)
	require.Contains(t, serviceTags, `"key":"service.name"`)
	require.Contains(t, serviceTags, `"value":"checkout"`)

	spanTags := string(fields["tags"].At(0).(json.RawMessage))
	require.Contains(t, spanTags, `"key":"http.method"`)
	require.Contains(t, spanTags, `"value":"GET"`)

	paymentSpanTags := string(fields["tags"].At(1).(json.RawMessage))
	require.Contains(t, paymentSpanTags, `"key":"service.peer.name"`)
	require.Contains(t, paymentSpanTags, `"value":"stripe-api"`)
	require.Contains(t, paymentSpanTags, `"key":"peer.service"`)

	logs := string(fields["logs"].At(0).(json.RawMessage))
	require.Contains(t, logs, `"name":"exception"`)
	require.Contains(t, logs, `"key":"exception.type"`)
	require.Contains(t, logs, `"timestamp":1678974011050`)

	references := string(fields["references"].At(0).(json.RawMessage))
	require.Contains(t, references, `"traceID":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`)
	require.Contains(t, references, `"spanID":"2222222222222222"`)

	warnings := string(fields["warnings"].At(1).(json.RawMessage))
	require.Contains(t, warnings, `Span status: ERROR - declined`)

	stackTraces := string(fields["stackTraces"].At(1).(json.RawMessage))
	require.Contains(t, stackTraces, `SyntheticFailure: declined`)

	nodesFrame := frames[1]
	require.Equal(t, "nodes", nodesFrame.Name)
	require.Equal(t, data.VisTypeNodeGraph, string(nodesFrame.Meta.PreferredVisualization))
	require.Equal(t, 2, nodesFrame.Rows())

	edgesFrame := frames[2]
	require.Equal(t, "edges", edgesFrame.Name)
	require.Equal(t, data.VisTypeNodeGraph, string(edgesFrame.Meta.PreferredVisualization))
	require.Equal(t, 1, edgesFrame.Rows())
	edgeFields := make(map[string]*data.Field)
	for _, field := range edgesFrame.Fields {
		edgeFields[field.Name] = field
	}
	require.Equal(t, "checkout", edgeFields["source"].At(0))
	require.Equal(t, "payments", edgeFields["target"].At(0))
}

func TestProcessTraceSearchResponse(t *testing.T) {
	query := []byte(`
		[
			{
				"refId": "A",
				"metrics": [{ "type": "trace_search", "id": "1", "settings": { "limit": "1", "spanLimit": "1000" } }],
				"query": "service_name:checkout"
			}
		]
	`)

	response := []byte(`
		{
			"responses": [
				{
					"hits": {
						"hits": [
							{
								"_source": {
									"trace_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
									"span_id": "1111111111111111",
									"service_name": "checkout",
									"span_name": "GET /checkout",
									"span_start_timestamp_nanos": 1678974011000000000,
									"span_duration_millis": 100
								}
							},
							{
								"_source": {
									"trace_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
									"span_id": "2222222222222222",
									"parent_span_id": "1111111111111111",
									"service_name": "payments",
									"span_name": "POST /charge",
									"span_start_timestamp_nanos": 1678974011020000000,
									"span_duration_millis": 25,
									"span_status": { "code": "ERROR", "message": "declined" }
								}
							},
							{
								"_source": {
									"trace_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
									"span_id": "3333333333333333",
									"service_name": "checkout",
									"span_name": "GET /cart",
									"span_start_timestamp_nanos": 1678974010000000000,
									"span_duration_millis": 10
								}
							},
							{
								"_source": {
									"trace_id": "cccccccccccccccccccccccccccccccc",
									"span_id": "4444444444444444",
									"service_name": "checkout",
									"span_name": "GET /old-root",
									"span_start_timestamp_nanos": 1678974010500000000,
									"span_duration_millis": 10
								}
							},
							{
								"_source": {
									"trace_id": "cccccccccccccccccccccccccccccccc",
									"span_id": "5555555555555555",
									"parent_span_id": "4444444444444444",
									"service_name": "payments",
									"span_name": "POST /late-child",
									"span_start_timestamp_nanos": 1678974025000000000,
									"span_duration_millis": 10
								}
							}
						]
					}
				}
			]
		}
	`)

	result, err := queryDataTest(query, response)
	require.NoError(t, err)

	frames := result.response.Responses["A"].Frames
	require.Len(t, frames, 1)
	traceSearchFrame := frames[0]
	require.Equal(t, data.VisTypeTable, string(traceSearchFrame.Meta.PreferredVisualization))
	require.Equal(t, 1, traceSearchFrame.Rows())

	fields := make(map[string]*data.Field)
	for _, field := range traceSearchFrame.Fields {
		fields[field.Name] = field
	}

	require.Equal(t, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", fields["traceID"].At(0))
	require.Equal(t, time.UnixMilli(1678974011000).UTC(), fields["startTime"].At(0))
	require.Equal(t, 100.0, fields["duration"].At(0))
	require.Equal(t, int64(2), fields["spans"].At(0))
	require.Equal(t, "checkout, payments", fields["services"].At(0))
	require.Equal(t, "checkout", fields["rootService"].At(0))
	require.Equal(t, "GET /checkout", fields["rootSpan"].At(0))
	require.Equal(t, int64(1), fields["errors"].At(0))
}

func TestTraceTimestampMillisUsesDeclaredUnit(t *testing.T) {
	nanos, ok := traceTimestampMillis(json.Number("1678974011123456789"), TimestampNanos)
	require.True(t, ok)
	require.InDelta(t, 1678974011123.4568, nanos, 0.0001)

	micros, ok := traceTimestampMillis(json.Number("1678974011123456"), TimestampMicros)
	require.True(t, ok)
	require.InDelta(t, 1678974011123.456, micros, 0.0001)

	millis, ok := traceTimestampMillis(json.Number("1678974011123"), TimestampMillis)
	require.True(t, ok)
	require.Equal(t, 1678974011123.0, millis)

	seconds, ok := traceTimestampMillis(json.Number("1678974011"), TimestampSecs)
	require.True(t, ok)
	require.Equal(t, 1678974011000.0, seconds)

	_, ok = traceTimestampMillis(json.Number("1678974011123456789"), "")
	require.False(t, ok)
}

func TestTraceSpanStatusUsesErrorAttributeFallbackForUnsetStatus(t *testing.T) {
	statusCode, _, errorColor := traceSpanStatus(map[string]interface{}{
		"span_status": map[string]interface{}{
			"code": json.Number("0"),
		},
		"span_attributes": map[string]interface{}{
			"error": true,
		},
	})
	require.Equal(t, int64(2), statusCode)
	require.Equal(t, "red", errorColor)

	statusCode, _, errorColor = traceSpanStatus(map[string]interface{}{
		"span_status": map[string]interface{}{
			"code": "UNSET",
		},
		"span_attributes": map[string]interface{}{
			"otel.status_code": "ERROR",
		},
	})
	require.Equal(t, int64(2), statusCode)
	require.Equal(t, "red", errorColor)

	statusCode, _, errorColor = traceSpanStatus(map[string]interface{}{
		"span_status": map[string]interface{}{
			"code": json.Number("1"),
		},
		"span_attributes": map[string]interface{}{
			"error": true,
		},
	})
	require.Equal(t, int64(1), statusCode)
	require.Equal(t, "", errorColor)
}

func TestTraceStackTracesDedupAndTruncate(t *testing.T) {
	longStackTrace := strings.Repeat("x", maxTraceStackTraceBytes+1024)
	stackTraces := traceStackTraces(map[string]interface{}{
		"span_attributes": map[string]interface{}{
			"exception.stacktrace": longStackTrace,
		},
		"events": []interface{}{
			map[string]interface{}{
				"event_attributes": map[string]interface{}{
					"exception.stacktrace": longStackTrace,
				},
			},
		},
	})

	require.Len(t, stackTraces, 1)
	require.LessOrEqual(t, len(stackTraces[0]), maxTraceStackTraceBytes)
	require.True(t, strings.HasSuffix(stackTraces[0], traceStackTraceTruncatedText))
}

func TestTraceKeyValuePairsUnwrapsOtelValuesAndFlattensNestedMaps(t *testing.T) {
	pairs := traceKeyValuePairs(map[string]interface{}{
		"http": map[string]interface{}{
			"method": map[string]interface{}{
				"string_value": "GET",
			},
			"status_code": map[string]interface{}{
				"int_value": json.Number("200"),
			},
		},
	})

	method, ok := traceFindKeyValuePair(pairs, "http.method")
	require.True(t, ok)
	require.Equal(t, "GET", method.Value)
	require.Equal(t, "string", method.Type)

	statusCode, ok := traceFindKeyValuePair(pairs, "http.status_code")
	require.True(t, ok)
	require.Equal(t, json.Number("200"), statusCode.Value)
	require.Equal(t, "number", statusCode.Type)
}

func TestTraceNodeGraphFramesCollapseSelfEdges(t *testing.T) {
	frames := traceNodeGraphFrames([]traceGraphSpan{
		{
			spanID:         "root",
			serviceName:    "checkout",
			durationMillis: 10,
		},
		{
			spanID:         "child",
			parentSpanID:   "root",
			serviceName:    "checkout",
			durationMillis: 5,
		},
	})

	require.Len(t, frames, 2)
	require.Equal(t, 1, frames[0].Rows())
	require.Equal(t, 0, frames[1].Rows())
}

func TestTraceDataLinks(t *testing.T) {
	t.Run("trace spans link to configured logs datasource", func(t *testing.T) {
		targets := map[string]string{
			"A": `{
				"refId": "A",
				"metrics": [{ "type": "traces", "id": "1", "settings": { "limit": "1000" } }],
				"query": "trace_id:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
			}`,
		}
		response := `{
			"responses": [
				{
					"hits": {
						"hits": [
							{
								"_source": {
									"trace_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
									"span_id": "1111111111111111",
									"service_name": "checkout",
									"span_name": "GET /checkout",
									"span_start_timestamp_nanos": 1678974011000000000,
									"span_duration_millis": 100
								}
							}
						]
					}
				}
			]
		}`
		dsInfo := &es.DatasourceInfo{
			UID:                "traces-uid",
			Name:               "Quickwit Traces",
			LogsDatasourceUID:  "logs-uid",
			LogsDatasourceName: "Quickwit Logs",
		}

		result, err := parseTestResponseWithDatasourceInfo(targets, response, dsInfo)
		require.NoError(t, err)

		spanIDField, _ := result.Responses["A"].Frames[0].FieldByName("spanID")
		require.NotNil(t, spanIDField)
		require.NotNil(t, spanIDField.Config)
		require.Len(t, spanIDField.Config.Links, 1)

		link := spanIDField.Config.Links[0]
		require.Equal(t, "Logs for span", link.Title)
		require.NotNil(t, link.Internal)
		require.Equal(t, "logs-uid", link.Internal.DatasourceUID)
		require.Equal(t, "Quickwit Logs", link.Internal.DatasourceName)

		query := link.Internal.Query.(map[string]interface{})
		require.Equal(t, "trace_id:${__span.traceId} AND span_id:${__span.spanId}", query["query"])
		require.Equal(t, logsType, query["queryType"])
		require.Equal(t, map[string]string{"type": quickwitPluginID, "uid": "logs-uid"}, query["datasource"])
		require.Equal(t, logsType, query["metrics"].([]map[string]interface{})[0]["type"])
	})

	t.Run("trace search rows link to configured traces datasource", func(t *testing.T) {
		targets := map[string]string{
			"A": `{
				"refId": "A",
				"metrics": [{ "type": "trace_search", "id": "1", "settings": { "limit": "20", "spanLimit": "1000" } }],
				"query": "service_name:checkout"
			}`,
		}
		response := `{
			"responses": [
				{
					"hits": {
						"hits": [
							{
								"_source": {
									"trace_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
									"span_id": "1111111111111111",
									"service_name": "checkout",
									"span_name": "GET /checkout",
									"span_start_timestamp_nanos": 1678974011000000000,
									"span_duration_millis": 100
								}
							}
						]
					}
				}
			]
		}`
		dsInfo := &es.DatasourceInfo{
			UID:                  "logs-uid",
			Name:                 "Quickwit Logs",
			TracesDatasourceUID:  "traces-uid",
			TracesDatasourceName: "Quickwit Traces",
		}

		result, err := parseTestResponseWithDatasourceInfo(targets, response, dsInfo)
		require.NoError(t, err)

		traceIDField, _ := result.Responses["A"].Frames[0].FieldByName("traceID")
		require.NotNil(t, traceIDField)
		require.NotNil(t, traceIDField.Config)
		require.Len(t, traceIDField.Config.Links, 1)

		link := traceIDField.Config.Links[0]
		require.Equal(t, "Open trace", link.Title)
		require.NotNil(t, link.Internal)
		require.Equal(t, "traces-uid", link.Internal.DatasourceUID)
		require.Equal(t, "Quickwit Traces", link.Internal.DatasourceName)

		query := link.Internal.Query.(map[string]interface{})
		require.Equal(t, "trace_id:${__value.raw}", query["query"])
		require.Equal(t, tracesType, query["queryType"])
		require.Equal(t, map[string]string{"type": quickwitPluginID, "uid": "traces-uid"}, query["datasource"])
		require.Equal(t, tracesType, query["metrics"].([]map[string]interface{})[0]["type"])
	})
}

func TestTraceParserHelpers(t *testing.T) {
	t.Run("service tags add service.name when Quickwit has only top-level service_name", func(t *testing.T) {
		tags := traceServiceTags(map[string]interface{}{
			"service.namespace": "demo",
		}, "checkout")

		serviceNameCount := 0
		for _, tag := range tags {
			if tag.Key == "service.name" {
				serviceNameCount++
				require.Equal(t, "checkout", tag.Value)
			}
		}
		require.Equal(t, 1, serviceNameCount)
	})

	t.Run("service tags preserve existing service.name", func(t *testing.T) {
		tags := traceServiceTags(map[string]interface{}{
			"service.name": "checkout-api",
		}, "checkout")

		serviceNameCount := 0
		for _, tag := range tags {
			if tag.Key == "service.name" {
				serviceNameCount++
				require.Equal(t, "checkout-api", tag.Value)
			}
		}
		require.Equal(t, 1, serviceNameCount)
	})

	t.Run("node graph skips spans without service names", func(t *testing.T) {
		frames := traceNodeGraphFrames([]traceGraphSpan{
			{spanID: "1111111111111111", durationMillis: 10},
		})

		require.Len(t, frames, 0)
	})
}
