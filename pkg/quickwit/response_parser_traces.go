package quickwit

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"

	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
	"github.com/quickwit-oss/quickwit-datasource/pkg/utils"
)

const (
	tracesType       = "traces"
	traceSearchType  = "trace_search"
	quickwitPluginID = "quickwit-quickwit-datasource"

	maxTraceStackTraceBytes      = 64 * 1024
	traceStackTraceTruncatedText = "\n... truncated"
)

type traceKeyValuePair struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
	Type  string      `json:"type,omitempty"`
}

type traceLog struct {
	Timestamp float64             `json:"timestamp"`
	Fields    []traceKeyValuePair `json:"fields"`
	Name      string              `json:"name,omitempty"`
}

type traceSpanReference struct {
	TraceID string              `json:"traceID"`
	SpanID  string              `json:"spanID"`
	Tags    []traceKeyValuePair `json:"tags,omitempty"`
}

type traceSearchSummary struct {
	traceID         string
	startTimeMillis float64
	endTimeMillis   float64
	latestMillis    float64
	spanCount       int
	errorCount      int
	services        map[string]bool
	spanNames       map[string]bool
	rootServiceName string
	rootSpanName    string
	rootStartMillis float64
}

type traceGraphSpan struct {
	spanID         string
	parentSpanID   string
	serviceName    string
	durationMillis float64
	statusCode     int64
}

type traceGraphNode struct {
	id             string
	spanCount      int
	errorCount     int
	durationMillis float64
}

type traceGraphEdge struct {
	id             string
	source         string
	target         string
	callCount      int
	errorCount     int
	durationMillis float64
}

func processTracesResponse(res *es.SearchResponse, target *Query, configuredFields es.ConfiguredFields, dsInfo *es.DatasourceInfo, queryRes *backend.DataResponse) error {
	hits := []map[string]interface{}{}
	if res.Hits != nil {
		hits = res.Hits.Hits
	}

	traceIDs := make([]string, 0, len(hits))
	spanIDs := make([]string, 0, len(hits))
	parentSpanIDs := make([]*string, 0, len(hits))
	operationNames := make([]string, 0, len(hits))
	serviceNames := make([]string, 0, len(hits))
	serviceTags := make([]json.RawMessage, 0, len(hits))
	startTimes := make([]float64, 0, len(hits))
	durations := make([]float64, 0, len(hits))
	logs := make([]json.RawMessage, 0, len(hits))
	references := make([]json.RawMessage, 0, len(hits))
	tags := make([]json.RawMessage, 0, len(hits))
	kinds := make([]string, 0, len(hits))
	statusCodes := make([]int64, 0, len(hits))
	statusMessages := make([]string, 0, len(hits))
	instrumentationLibraryNames := make([]string, 0, len(hits))
	instrumentationLibraryVersions := make([]string, 0, len(hits))
	traceStates := make([]string, 0, len(hits))
	errorIconColors := make([]string, 0, len(hits))
	warnings := make([]json.RawMessage, 0, len(hits))
	stackTraces := make([]json.RawMessage, 0, len(hits))
	graphSpans := make([]traceGraphSpan, 0, len(hits))

	for _, hit := range hits {
		source, ok := hit["_source"].(map[string]interface{})
		if !ok || source == nil {
			continue
		}

		traceID := traceString(source["trace_id"])
		spanID := traceString(source["span_id"])
		if traceID == "" || spanID == "" {
			continue
		}

		parentSpanID := traceParentSpanID(source["parent_span_id"])
		spanTags := traceSpanTags(source["span_attributes"])
		serviceName := traceString(source["service_name"])
		spanName := traceString(source["span_name"])
		durationMillis := traceDurationMillis(source)
		statusCode, statusMessage, errorIconColor := traceSpanStatus(source)

		traceIDs = append(traceIDs, traceID)
		spanIDs = append(spanIDs, spanID)
		parentSpanIDs = append(parentSpanIDs, parentSpanID)
		operationNames = append(operationNames, spanName)
		serviceNames = append(serviceNames, serviceName)
		serviceTags = append(serviceTags, traceJSONRawMessage(traceServiceTags(source["resource_attributes"], serviceName)))
		startTimes = append(startTimes, traceStartTimeMillis(source, configuredFields))
		durations = append(durations, durationMillis)
		logs = append(logs, traceJSONRawMessage(traceLogs(source["events"])))
		references = append(references, traceJSONRawMessage(traceReferences(source["links"])))
		tags = append(tags, traceJSONRawMessage(spanTags))
		kinds = append(kinds, traceSpanKind(source["span_kind"]))
		statusCodes = append(statusCodes, statusCode)
		statusMessages = append(statusMessages, statusMessage)
		errorIconColors = append(errorIconColors, errorIconColor)
		instrumentationLibraryNames = append(instrumentationLibraryNames, traceString(source["scope_name"]))
		instrumentationLibraryVersions = append(instrumentationLibraryVersions, traceString(source["scope_version"]))
		traceStates = append(traceStates, traceString(source["trace_state"]))
		warnings = append(warnings, traceJSONRawMessage(traceWarnings(source, statusCode, statusMessage)))
		stackTraces = append(stackTraces, traceJSONRawMessage(traceStackTraces(source)))

		parentID := ""
		if parentSpanID != nil {
			parentID = *parentSpanID
		}
		graphSpans = append(graphSpans, traceGraphSpan{
			spanID:         spanID,
			parentSpanID:   parentID,
			serviceName:    serviceName,
			durationMillis: durationMillis,
			statusCode:     statusCode,
		})
	}

	spanIDField := data.NewField("spanID", nil, spanIDs)
	if links := traceToLogsDataLinks(dsInfo); len(links) > 0 {
		spanIDField.SetConfig(&data.FieldConfig{Links: links})
	}

	frame := data.NewFrame("",
		data.NewField("traceID", nil, traceIDs),
		spanIDField,
		data.NewField("parentSpanID", nil, parentSpanIDs),
		data.NewField("operationName", nil, operationNames),
		data.NewField("serviceName", nil, serviceNames),
		data.NewField("serviceTags", nil, serviceTags),
		data.NewField("startTime", nil, startTimes),
		data.NewField("duration", nil, durations),
		data.NewField("logs", nil, logs),
		data.NewField("references", nil, references),
		data.NewField("tags", nil, tags),
		data.NewField("kind", nil, kinds),
		data.NewField("statusCode", nil, statusCodes),
		data.NewField("statusMessage", nil, statusMessages),
		data.NewField("instrumentationLibraryName", nil, instrumentationLibraryNames),
		data.NewField("instrumentationLibraryVersion", nil, instrumentationLibraryVersions),
		data.NewField("traceState", nil, traceStates),
		data.NewField("errorIconColor", nil, errorIconColors),
		data.NewField("warnings", nil, warnings),
		data.NewField("stackTraces", nil, stackTraces),
	)
	setPreferredVisType(frame, data.VisTypeTrace)
	frames := data.Frames{frame}
	frames = append(frames, traceNodeGraphFrames(graphSpans)...)
	queryRes.Frames = frames
	return nil
}

func processTraceSearchResponse(res *es.SearchResponse, target *Query, dsInfo *es.DatasourceInfo, queryRes *backend.DataResponse) error {
	hits := []map[string]interface{}{}
	if res.Hits != nil {
		hits = res.Hits.Hits
	}

	summariesByTraceID := map[string]*traceSearchSummary{}
	traceOrder := []string{}

	for _, hit := range hits {
		source, ok := hit["_source"].(map[string]interface{})
		if !ok || source == nil {
			continue
		}

		traceID := traceString(source["trace_id"])
		spanID := traceString(source["span_id"])
		if traceID == "" || spanID == "" {
			continue
		}

		summary, exists := summariesByTraceID[traceID]
		if !exists {
			summary = &traceSearchSummary{
				traceID:         traceID,
				startTimeMillis: 0,
				endTimeMillis:   0,
				latestMillis:    0,
				services:        map[string]bool{},
				spanNames:       map[string]bool{},
				rootStartMillis: 0,
			}
			summariesByTraceID[traceID] = summary
			traceOrder = append(traceOrder, traceID)
		}

		startTimeMillis := traceStartTimeMillis(source, es.ConfiguredFields{})
		endTimeMillis := traceEndTimeMillis(source, startTimeMillis)
		if startTimeMillis > 0 && (summary.startTimeMillis == 0 || startTimeMillis < summary.startTimeMillis) {
			summary.startTimeMillis = startTimeMillis
		}
		if endTimeMillis > summary.endTimeMillis {
			summary.endTimeMillis = endTimeMillis
		}
		if startTimeMillis > summary.latestMillis {
			summary.latestMillis = startTimeMillis
		}

		summary.spanCount++
		if traceIsErrorSpan(source) {
			summary.errorCount++
		}
		if serviceName := traceString(source["service_name"]); serviceName != "" {
			summary.services[serviceName] = true
		}
		if spanName := traceString(source["span_name"]); spanName != "" {
			summary.spanNames[spanName] = true
		}

		if traceParentSpanID(source["parent_span_id"]) == nil {
			if summary.rootSpanName == "" || startTimeMillis < summary.rootStartMillis || summary.rootStartMillis == 0 {
				summary.rootSpanName = traceString(source["span_name"])
				summary.rootServiceName = traceString(source["service_name"])
				summary.rootStartMillis = startTimeMillis
			}
		}
	}

	summaries := make([]*traceSearchSummary, 0, len(traceOrder))
	for _, traceID := range traceOrder {
		summary := summariesByTraceID[traceID]
		if summary.rootSpanName == "" {
			summary.rootSpanName = firstSortedMapKey(summary.spanNames)
			summary.rootServiceName = firstSortedMapKey(summary.services)
		}
		summaries = append(summaries, summary)
	}
	sort.SliceStable(summaries, func(i, j int) bool {
		return summaries[i].startTimeMillis > summaries[j].startTimeMillis
	})

	limit := defaultSize
	if len(target.Metrics) > 0 {
		limit = stringToIntWithDefaultValue(target.Metrics[0].Settings.Get("limit").MustString(), 20)
	}
	if limit > 0 && len(summaries) > limit {
		summaries = summaries[:limit]
	}

	traceIDs := make([]string, 0, len(summaries))
	startTimes := make([]time.Time, 0, len(summaries))
	durations := make([]float64, 0, len(summaries))
	spanCounts := make([]int64, 0, len(summaries))
	services := make([]string, 0, len(summaries))
	rootServices := make([]string, 0, len(summaries))
	rootSpans := make([]string, 0, len(summaries))
	matchedSpans := make([]string, 0, len(summaries))
	errorCounts := make([]int64, 0, len(summaries))

	for _, summary := range summaries {
		traceIDs = append(traceIDs, summary.traceID)
		startTimes = append(startTimes, time.UnixMilli(int64(summary.startTimeMillis)).UTC())
		duration := summary.endTimeMillis - summary.startTimeMillis
		if duration < 0 {
			duration = 0
		}
		durations = append(durations, duration)
		spanCounts = append(spanCounts, int64(summary.spanCount))
		services = append(services, joinSortedMapKeys(summary.services, ", "))
		rootServices = append(rootServices, summary.rootServiceName)
		rootSpans = append(rootSpans, summary.rootSpanName)
		matchedSpans = append(matchedSpans, joinSortedMapKeysWithLimit(summary.spanNames, ", ", 5))
		errorCounts = append(errorCounts, int64(summary.errorCount))
	}

	traceIDField := data.NewField("traceID", nil, traceIDs).SetConfig(&data.FieldConfig{
		DisplayName: "Trace ID",
		Links:       traceSearchDataLinks(dsInfo),
	})
	durationField := data.NewField("duration", nil, durations).SetConfig(&data.FieldConfig{
		DisplayName: "Duration",
		Unit:        "ms",
	})
	errorField := data.NewField("errors", nil, errorCounts).SetConfig(traceSearchErrorsFieldConfig())

	frame := data.NewFrame("Trace search",
		traceIDField,
		data.NewField("startTime", nil, startTimes).SetConfig(&data.FieldConfig{DisplayName: "Start time"}),
		durationField,
		data.NewField("spans", nil, spanCounts).SetConfig(&data.FieldConfig{DisplayName: "Spans"}),
		data.NewField("services", nil, services).SetConfig(&data.FieldConfig{DisplayName: "Services"}),
		data.NewField("rootService", nil, rootServices).SetConfig(&data.FieldConfig{DisplayName: "Root service"}),
		data.NewField("rootSpan", nil, rootSpans).SetConfig(&data.FieldConfig{DisplayName: "Root span"}),
		data.NewField("matchedSpans", nil, matchedSpans).SetConfig(&data.FieldConfig{DisplayName: "Matched spans"}),
		errorField,
	)
	setPreferredVisType(frame, data.VisTypeTable)
	queryRes.Frames = data.Frames{frame}
	return nil
}

func traceParentSpanID(value interface{}) *string {
	parentSpanID := traceString(value)
	if parentSpanID == "" || strings.Trim(parentSpanID, "0") == "" {
		return nil
	}
	return &parentSpanID
}

func traceString(value interface{}) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case json.Number:
		return v.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

func traceNumber(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case json.Number:
		parsed, err := v.Float64()
		return parsed, err == nil
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	case uint64:
		return float64(v), true
	case uint32:
		return float64(v), true
	case string:
		parsed, err := strconv.ParseFloat(v, 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

func traceTimestampMillis(value interface{}, outputFormat string) (float64, bool) {
	switch typedValue := value.(type) {
	case json.Number:
		return traceUnixTimestampMillisFromString(typedValue.String(), outputFormat)
	case string:
		stringValue := strings.TrimSpace(typedValue)
		if stringValue == "" {
			return 0, false
		}
		if timestamp, ok := traceUnixTimestampMillisFromString(stringValue, outputFormat); ok {
			return timestamp, true
		}
		if outputFormat != "" {
			if parsedTime, err := utils.ParseTime(stringValue, outputFormat); err == nil {
				return float64(parsedTime.UnixNano()) / 1e6, true
			}
		}
		if parsedTime, err := time.Parse(time.RFC3339Nano, stringValue); err == nil {
			return float64(parsedTime.UnixNano()) / 1e6, true
		}
		return 0, false
	case int:
		return traceUnixTimestampMillisFromInt(int64(typedValue), outputFormat)
	case int64:
		return traceUnixTimestampMillisFromInt(typedValue, outputFormat)
	case int32:
		return traceUnixTimestampMillisFromInt(int64(typedValue), outputFormat)
	case uint64:
		return traceUnixTimestampMillisFromFloat(float64(typedValue), outputFormat)
	case uint32:
		return traceUnixTimestampMillisFromFloat(float64(typedValue), outputFormat)
	case float64:
		return traceUnixTimestampMillisFromFloat(typedValue, outputFormat)
	case float32:
		return traceUnixTimestampMillisFromFloat(float64(typedValue), outputFormat)
	}

	return 0, false
}

func traceUnixTimestampMillisFromString(value string, outputFormat string) (float64, bool) {
	switch outputFormat {
	case TimestampSecs, TimestampMillis, TimestampMicros, TimestampNanos:
	default:
		return 0, false
	}

	if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
		return traceUnixTimestampMillisFromInt(parsed, outputFormat)
	}
	if parsed, err := strconv.ParseFloat(value, 64); err == nil {
		return traceUnixTimestampMillisFromFloat(parsed, outputFormat)
	}
	return 0, false
}

func traceUnixTimestampMillisFromInt(value int64, outputFormat string) (float64, bool) {
	switch outputFormat {
	case TimestampNanos:
		return float64(value/1_000_000) + float64(value%1_000_000)/1_000_000, true
	case TimestampMicros:
		return float64(value/1_000) + float64(value%1_000)/1_000, true
	case TimestampMillis:
		return float64(value), true
	case TimestampSecs:
		return float64(value) * 1000, true
	default:
		return 0, false
	}
}

func traceUnixTimestampMillisFromFloat(value float64, outputFormat string) (float64, bool) {
	switch outputFormat {
	case TimestampNanos:
		return value / 1_000_000, true
	case TimestampMicros:
		return value / 1_000, true
	case TimestampMillis:
		return value, true
	case TimestampSecs:
		return value * 1000, true
	default:
		return 0, false
	}
}

func traceStartTimeMillis(source map[string]interface{}, configuredFields es.ConfiguredFields) float64 {
	if startTime, ok := traceTimestampMillis(source["span_start_timestamp_nanos"], TimestampNanos); ok {
		return startTime
	}
	if configuredFields.TimeField != "" {
		if startTime, ok := traceTimestampMillis(source[configuredFields.TimeField], configuredFields.TimeOutputFormat); ok {
			return startTime
		}
	}
	return 0
}

func traceDurationMillis(source map[string]interface{}) float64 {
	if duration, ok := traceNumber(source["span_duration_millis"]); ok {
		return duration
	}

	start, startOK := traceTimestampMillis(source["span_start_timestamp_nanos"], TimestampNanos)
	end, endOK := traceTimestampMillis(source["span_end_timestamp_nanos"], TimestampNanos)
	if startOK && endOK && end >= start {
		return end - start
	}
	return 0
}

func traceEndTimeMillis(source map[string]interface{}, startTimeMillis float64) float64 {
	if endTimeMillis, ok := traceTimestampMillis(source["span_end_timestamp_nanos"], TimestampNanos); ok {
		return endTimeMillis
	}
	return startTimeMillis + traceDurationMillis(source)
}

func traceSpanKind(value interface{}) string {
	kindValue, ok := traceNumber(value)
	if !ok {
		return ""
	}

	switch int(kindValue) {
	case 1:
		return "internal"
	case 2:
		return "server"
	case 3:
		return "client"
	case 4:
		return "producer"
	case 5:
		return "consumer"
	default:
		return ""
	}
}

func traceSpanStatus(source map[string]interface{}) (int64, string, string) {
	statusMap, _ := source["span_status"].(map[string]interface{})
	statusCodeValue := traceAttributeValue(statusMap["code"])
	statusMessage := traceString(traceAttributeValue(statusMap["message"]))
	attributeError := traceStatusAttributesIndicateError(source["span_attributes"])

	if code, ok := traceNumber(statusCodeValue); ok {
		intCode := int64(code)
		switch intCode {
		case 2:
			return intCode, statusMessage, "red"
		case 1:
			return intCode, statusMessage, ""
		default:
			if attributeError {
				return 2, statusMessage, "red"
			}
			return 0, statusMessage, ""
		}
	}

	switch strings.ToLower(traceString(statusCodeValue)) {
	case "error":
		return 2, statusMessage, "red"
	case "ok":
		return 1, statusMessage, ""
	case "unset":
		if attributeError {
			return 2, statusMessage, "red"
		}
		return 0, statusMessage, ""
	default:
		if attributeError {
			return 2, statusMessage, "red"
		}
		return 0, statusMessage, ""
	}
}

func traceIsErrorSpan(source map[string]interface{}) bool {
	statusCode, _, _ := traceSpanStatus(source)
	return statusCode == 2
}

func traceAttributeBool(attributes interface{}, key string) bool {
	attributesMap, ok := attributes.(map[string]interface{})
	if !ok {
		return false
	}

	value, exists := attributesMap[key]
	if !exists {
		return false
	}

	switch typedValue := traceAttributeValue(value).(type) {
	case bool:
		return typedValue
	case string:
		return strings.EqualFold(typedValue, "true") || strings.EqualFold(typedValue, "error")
	default:
		return false
	}
}

func traceStatusAttributesIndicateError(attributes interface{}) bool {
	return traceAttributeBool(attributes, "error") || traceAttributeBool(attributes, "otel.status_code")
}

func traceWarnings(source map[string]interface{}, statusCode int64, statusMessage string) []string {
	warnings := []string{}
	if statusCode == 2 {
		if statusMessage != "" {
			warnings = append(warnings, fmt.Sprintf("Span status: ERROR - %s", statusMessage))
		} else {
			warnings = append(warnings, "Span status: ERROR")
		}
	}
	if traceAttributeBool(source["span_attributes"], "error") {
		warnings = append(warnings, "Span attribute error=true")
	}

	for _, dropped := range []struct {
		field string
		label string
	}{
		{field: "span_dropped_attributes_count", label: "span attributes"},
		{field: "span_dropped_events_count", label: "span events"},
		{field: "span_dropped_links_count", label: "span links"},
	} {
		if count, ok := traceNumber(source[dropped.field]); ok && count > 0 {
			warnings = append(warnings, fmt.Sprintf("Dropped %s: %s", dropped.label, formatTraceCount(count)))
		}
	}
	return warnings
}

var traceStackTraceKeys = []string{
	"exception.stacktrace",
	"exception.stack_trace",
	"exception.stack",
	"stacktrace",
	"stack_trace",
}

func traceStackTraces(source map[string]interface{}) []string {
	stackTraces := []string{}
	seen := map[string]bool{}
	appendStackTrace := func(value interface{}) {
		stackTrace := traceStackTraceString(traceAttributeValue(value))
		stackTrace = truncateTraceStackTrace(stackTrace)
		if stackTrace == "" || seen[stackTrace] {
			return
		}
		seen[stackTrace] = true
		stackTraces = append(stackTraces, stackTrace)
	}

	if attributes, ok := source["span_attributes"].(map[string]interface{}); ok {
		for _, key := range traceStackTraceKeys {
			if value, exists := attributes[key]; exists {
				appendStackTrace(value)
			}
		}
	}

	events, _ := source["events"].([]interface{})
	for _, event := range events {
		eventMap, ok := event.(map[string]interface{})
		if !ok {
			continue
		}
		attributes, ok := eventMap["event_attributes"].(map[string]interface{})
		if !ok {
			continue
		}
		for _, key := range traceStackTraceKeys {
			if value, exists := attributes[key]; exists {
				appendStackTrace(value)
			}
		}
	}
	return stackTraces
}

func truncateTraceStackTrace(stackTrace string) string {
	if len(stackTrace) <= maxTraceStackTraceBytes {
		return stackTrace
	}

	limit := maxTraceStackTraceBytes - len(traceStackTraceTruncatedText)
	if limit <= 0 {
		return stackTrace[:maxTraceStackTraceBytes]
	}
	for limit > 0 && !utf8.RuneStart(stackTrace[limit]) {
		limit--
	}
	return stackTrace[:limit] + traceStackTraceTruncatedText
}

func traceStackTraceString(value interface{}) string {
	switch typedValue := value.(type) {
	case nil:
		return ""
	case string:
		return typedValue
	case []interface{}:
		lines := make([]string, 0, len(typedValue))
		for _, line := range typedValue {
			lineString := traceString(traceAttributeValue(line))
			if lineString != "" {
				lines = append(lines, lineString)
			}
		}
		return strings.Join(lines, "\n")
	default:
		bytes, err := json.Marshal(typedValue)
		if err == nil {
			return string(bytes)
		}
		return traceString(typedValue)
	}
}

func formatTraceCount(value float64) string {
	if value == float64(int64(value)) {
		return strconv.FormatInt(int64(value), 10)
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func traceJSONRawMessage(value interface{}) json.RawMessage {
	bytes, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage("[]")
	}
	return json.RawMessage(bytes)
}

func traceKeyValuePairs(value interface{}) []traceKeyValuePair {
	switch typedValue := value.(type) {
	case map[string]interface{}:
		pairs := []traceKeyValuePair{}
		traceAppendMapKeyValuePairs(&pairs, "", typedValue)
		return pairs
	case []interface{}:
		pairs := make([]traceKeyValuePair, 0, len(typedValue))
		for _, item := range typedValue {
			itemMap, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			key := traceString(itemMap["key"])
			if key == "" {
				continue
			}
			value := traceAttributeValue(itemMap["value"])
			pairs = append(pairs, traceKeyValuePair{Key: key, Value: value, Type: traceValueType(value)})
		}
		return pairs
	default:
		return []traceKeyValuePair{}
	}
}

func traceServiceTags(value interface{}, serviceName string) []traceKeyValuePair {
	pairs := traceKeyValuePairs(value)
	if serviceName == "" {
		return pairs
	}

	if _, exists := traceFindKeyValuePair(pairs, "service.name"); exists {
		return pairs
	}

	return append(pairs, traceKeyValuePair{
		Key:   "service.name",
		Value: serviceName,
		Type:  traceValueType(serviceName),
	})
}

func traceSpanTags(value interface{}) []traceKeyValuePair {
	pairs := traceKeyValuePairs(value)
	peerService, hasPeerService := traceFindKeyValuePair(pairs, "peer.service")
	servicePeerName, hasServicePeerName := traceFindKeyValuePair(pairs, "service.peer.name")

	// Grafana's trace view still keys the uninstrumented peer-service hint on
	// peer.service. Preserve the current OTel service.peer.name attribute and
	// add the legacy alias only when needed.
	if hasServicePeerName && !hasPeerService {
		pairs = append(pairs, traceKeyValuePair{
			Key:   "peer.service",
			Value: servicePeerName.Value,
			Type:  servicePeerName.Type,
		})
	}
	if hasPeerService && !hasServicePeerName {
		pairs = append(pairs, traceKeyValuePair{
			Key:   "service.peer.name",
			Value: peerService.Value,
			Type:  peerService.Type,
		})
	}
	return pairs
}

func traceFindKeyValuePair(pairs []traceKeyValuePair, key string) (traceKeyValuePair, bool) {
	for _, pair := range pairs {
		if pair.Key == key {
			return pair, true
		}
	}
	return traceKeyValuePair{}, false
}

func traceAppendMapKeyValuePairs(pairs *[]traceKeyValuePair, prefix string, value map[string]interface{}) {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}

		rawValue := traceAttributeValue(value[key])
		if nestedValue, ok := rawValue.(map[string]interface{}); ok {
			traceAppendMapKeyValuePairs(pairs, fullKey, nestedValue)
			continue
		}

		*pairs = append(*pairs, traceKeyValuePair{Key: fullKey, Value: rawValue, Type: traceValueType(rawValue)})
	}
}

func traceAttributeValue(value interface{}) interface{} {
	valueMap, ok := value.(map[string]interface{})
	if !ok {
		return value
	}

	for _, key := range []string{"string_value", "int_value", "double_value", "bool_value", "bytes_value", "array_value", "kvlist_value"} {
		if wrappedValue, exists := valueMap[key]; exists {
			return wrappedValue
		}
	}
	return value
}

func traceValueType(value interface{}) string {
	switch value.(type) {
	case string:
		return "string"
	case json.Number, float64, float32, int, int64, int32, uint64, uint32:
		return "number"
	case bool:
		return "boolean"
	default:
		return ""
	}
}

func traceLogs(value interface{}) []traceLog {
	events, ok := value.([]interface{})
	if !ok {
		return []traceLog{}
	}

	logs := make([]traceLog, 0, len(events))
	for _, event := range events {
		eventMap, ok := event.(map[string]interface{})
		if !ok {
			continue
		}

		log := traceLog{
			Name:   firstTraceString(eventMap, "event_name", "name"),
			Fields: traceKeyValuePairs(eventMap["event_attributes"]),
		}
		if timestamp, ok := firstTraceTimestampMillis(eventMap, "event_timestamp_nanos", "timestamp_nanos", "time_unix_nano", "timestamp", "time"); ok {
			log.Timestamp = timestamp
		}

		traceAppendEventFields(&log.Fields, eventMap)
		logs = append(logs, log)
	}
	return logs
}

func traceAppendEventFields(fields *[]traceKeyValuePair, eventMap map[string]interface{}) {
	keys := make([]string, 0, len(eventMap))
	for key := range eventMap {
		switch key {
		case "event_attributes", "event_name", "name", "event_timestamp_nanos", "timestamp_nanos", "time_unix_nano", "timestamp", "time":
			continue
		default:
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	for _, key := range keys {
		value := traceAttributeValue(eventMap[key])
		*fields = append(*fields, traceKeyValuePair{Key: key, Value: value, Type: traceValueType(value)})
	}
}

func traceReferences(value interface{}) []traceSpanReference {
	links, ok := value.([]interface{})
	if !ok {
		return []traceSpanReference{}
	}

	references := make([]traceSpanReference, 0, len(links))
	for _, link := range links {
		linkMap, ok := link.(map[string]interface{})
		if !ok {
			continue
		}

		traceID := firstTraceString(linkMap, "trace_id", "traceID")
		spanID := firstTraceString(linkMap, "span_id", "spanID")
		if traceID == "" || spanID == "" {
			continue
		}

		tags := traceKeyValuePairs(linkMap["attributes"])
		if len(tags) == 0 {
			tags = traceKeyValuePairs(linkMap["link_attributes"])
		}
		references = append(references, traceSpanReference{
			TraceID: traceID,
			SpanID:  spanID,
			Tags:    tags,
		})
	}
	return references
}

func firstSortedMapKey(values map[string]bool) string {
	keys := sortedMapKeys(values)
	if len(keys) == 0 {
		return ""
	}
	return keys[0]
}

func joinSortedMapKeys(values map[string]bool, separator string) string {
	return strings.Join(sortedMapKeys(values), separator)
}

func joinSortedMapKeysWithLimit(values map[string]bool, separator string, limit int) string {
	keys := sortedMapKeys(values)
	if limit > 0 && len(keys) > limit {
		keys = keys[:limit]
	}
	return strings.Join(keys, separator)
}

func sortedMapKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func traceSearchDataLinks(dsInfo *es.DatasourceInfo) []data.DataLink {
	if dsInfo == nil {
		return nil
	}

	datasourceUID := dsInfo.UID
	datasourceName := dsInfo.Name
	if dsInfo.TracesDatasourceUID != "" {
		datasourceUID = dsInfo.TracesDatasourceUID
		datasourceName = dsInfo.TracesDatasourceName
	}
	if datasourceUID == "" {
		return nil
	}

	return traceInternalDataLinks("Open trace", datasourceUID, datasourceName, "trace_id:${__value.raw}", tracesType, "1000")
}

func traceToLogsDataLinks(dsInfo *es.DatasourceInfo) []data.DataLink {
	if dsInfo == nil {
		return nil
	}

	datasourceUID := dsInfo.UID
	datasourceName := dsInfo.Name
	if dsInfo.LogsDatasourceUID != "" {
		datasourceUID = dsInfo.LogsDatasourceUID
		datasourceName = dsInfo.LogsDatasourceName
		if datasourceName == "" {
			datasourceName = "Quickwit logs"
		}
	}
	if datasourceUID == "" {
		return nil
	}

	return traceInternalDataLinks("Logs for span", datasourceUID, datasourceName, "trace_id:${__span.traceId} AND span_id:${__span.spanId}", logsType, "100")
}

func traceInternalDataLinks(title string, datasourceUID string, datasourceName string, query string, metricType string, limit string) []data.DataLink {
	return []data.DataLink{
		{
			Title: title,
			Internal: &data.InternalDataLink{
				DatasourceUID:  datasourceUID,
				DatasourceName: datasourceName,
				Query: map[string]interface{}{
					"refId":      "A",
					"query":      query,
					"queryType":  metricType,
					"datasource": map[string]string{"type": quickwitPluginID, "uid": datasourceUID},
					"filters":    []interface{}{},
					"bucketAggs": []interface{}{},
					"metrics": []map[string]interface{}{
						{
							"id":       "1",
							"type":     metricType,
							"settings": map[string]string{"limit": limit},
						},
					},
				},
			},
		},
	}
}

func traceNodeGraphFrames(spans []traceGraphSpan) data.Frames {
	if len(spans) == 0 {
		return data.Frames{}
	}

	nodesByID := map[string]*traceGraphNode{}
	spanServiceByID := map[string]string{}
	for _, span := range spans {
		if span.serviceName == "" {
			continue
		}
		spanServiceByID[span.spanID] = span.serviceName
		node, exists := nodesByID[span.serviceName]
		if !exists {
			node = &traceGraphNode{id: span.serviceName}
			nodesByID[span.serviceName] = node
		}
		node.spanCount++
		node.durationMillis += span.durationMillis
		if span.statusCode == 2 {
			node.errorCount++
		}
	}

	edgesByID := map[string]*traceGraphEdge{}
	for _, span := range spans {
		sourceService := spanServiceByID[span.parentSpanID]
		targetService := span.serviceName
		if sourceService == "" || targetService == "" || sourceService == targetService {
			continue
		}
		edgeID := sourceService + "->" + targetService
		edge, exists := edgesByID[edgeID]
		if !exists {
			edge = &traceGraphEdge{id: edgeID, source: sourceService, target: targetService}
			edgesByID[edgeID] = edge
		}
		edge.callCount++
		edge.durationMillis += span.durationMillis
		if span.statusCode == 2 {
			edge.errorCount++
		}
	}
	if len(nodesByID) == 0 {
		return data.Frames{}
	}

	return data.Frames{traceNodesFrame(nodesByID), traceEdgesFrame(edgesByID)}
}

func traceNodesFrame(nodesByID map[string]*traceGraphNode) *data.Frame {
	nodeIDs := sortedTraceGraphNodeIDs(nodesByID)
	ids := make([]string, 0, len(nodeIDs))
	titles := make([]string, 0, len(nodeIDs))
	subtitles := make([]string, 0, len(nodeIDs))
	mainStats := make([]string, 0, len(nodeIDs))
	secondaryStats := make([]string, 0, len(nodeIDs))
	colors := make([]string, 0, len(nodeIDs))
	okArcs := make([]float64, 0, len(nodeIDs))
	errorArcs := make([]float64, 0, len(nodeIDs))
	errorDetails := make([]int64, 0, len(nodeIDs))
	durationDetails := make([]float64, 0, len(nodeIDs))

	for _, id := range nodeIDs {
		node := nodesByID[id]
		ids = append(ids, id)
		titles = append(titles, id)
		subtitles = append(subtitles, "service")
		mainStats = append(mainStats, fmt.Sprintf("%d spans", node.spanCount))
		secondaryStats = append(secondaryStats, fmt.Sprintf("%.1f ms", node.durationMillis))
		colors = append(colors, traceServiceColor(id))
		if node.spanCount > 0 {
			errorRatio := float64(node.errorCount) / float64(node.spanCount)
			errorArcs = append(errorArcs, errorRatio)
			okArcs = append(okArcs, 1-errorRatio)
		} else {
			errorArcs = append(errorArcs, 0)
			okArcs = append(okArcs, 1)
		}
		errorDetails = append(errorDetails, int64(node.errorCount))
		durationDetails = append(durationDetails, node.durationMillis)
	}

	frame := data.NewFrame("nodes",
		data.NewField("id", nil, ids),
		data.NewField("title", nil, titles),
		data.NewField("subtitle", nil, subtitles),
		data.NewField("mainstat", nil, mainStats),
		data.NewField("secondarystat", nil, secondaryStats),
		data.NewField("color", nil, colors),
		data.NewField("arc__ok", nil, okArcs).SetConfig(traceFixedColorFieldConfig("green")),
		data.NewField("arc__errors", nil, errorArcs).SetConfig(traceFixedColorFieldConfig("red")),
		data.NewField("detail__errors", nil, errorDetails).SetConfig(&data.FieldConfig{DisplayName: "Errors"}),
		data.NewField("detail__duration_ms", nil, durationDetails).SetConfig(&data.FieldConfig{DisplayName: "Total duration", Unit: "ms"}),
	)
	setPreferredVisType(frame, data.VisTypeNodeGraph)
	return frame
}

func traceEdgesFrame(edgesByID map[string]*traceGraphEdge) *data.Frame {
	edgeIDs := sortedTraceGraphEdgeIDs(edgesByID)
	ids := make([]string, 0, len(edgeIDs))
	sources := make([]string, 0, len(edgeIDs))
	targets := make([]string, 0, len(edgeIDs))
	mainStats := make([]string, 0, len(edgeIDs))
	secondaryStats := make([]string, 0, len(edgeIDs))
	thicknesses := make([]float64, 0, len(edgeIDs))
	colors := make([]string, 0, len(edgeIDs))
	errorDetails := make([]int64, 0, len(edgeIDs))

	for _, id := range edgeIDs {
		edge := edgesByID[id]
		ids = append(ids, id)
		sources = append(sources, edge.source)
		targets = append(targets, edge.target)
		mainStats = append(mainStats, fmt.Sprintf("%d calls", edge.callCount))
		secondaryStats = append(secondaryStats, fmt.Sprintf("%.1f ms", edge.durationMillis))
		thicknesses = append(thicknesses, 1+float64(edge.callCount-1)*0.5)
		if edge.errorCount > 0 {
			colors = append(colors, "#d44a3a")
		} else {
			colors = append(colors, "#7eb26d")
		}
		errorDetails = append(errorDetails, int64(edge.errorCount))
	}

	frame := data.NewFrame("edges",
		data.NewField("id", nil, ids),
		data.NewField("source", nil, sources),
		data.NewField("target", nil, targets),
		data.NewField("mainstat", nil, mainStats),
		data.NewField("secondarystat", nil, secondaryStats),
		data.NewField("thickness", nil, thicknesses),
		data.NewField("color", nil, colors),
		data.NewField("detail__errors", nil, errorDetails).SetConfig(&data.FieldConfig{DisplayName: "Errors"}),
	)
	setPreferredVisType(frame, data.VisTypeNodeGraph)
	return frame
}

func traceFixedColorFieldConfig(color string) *data.FieldConfig {
	return &data.FieldConfig{
		Color: map[string]interface{}{
			"mode":       "fixed",
			"fixedColor": color,
		},
	}
}

func sortedTraceGraphNodeIDs(nodesByID map[string]*traceGraphNode) []string {
	ids := make([]string, 0, len(nodesByID))
	for id := range nodesByID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func sortedTraceGraphEdgeIDs(edgesByID map[string]*traceGraphEdge) []string {
	ids := make([]string, 0, len(edgesByID))
	for id := range edgesByID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func traceServiceColor(serviceName string) string {
	palette := []string{
		"#7eb26d",
		"#eab839",
		"#6ed0e0",
		"#ef843c",
		"#e24d42",
		"#1f78c1",
		"#ba43a9",
		"#705da0",
		"#508642",
		"#cca300",
	}
	hash := 0
	for _, char := range serviceName {
		hash = (hash*31 + int(char)) & 0x7fffffff
	}
	return palette[hash%len(palette)]
}

func traceSearchErrorsFieldConfig() *data.FieldConfig {
	return &data.FieldConfig{
		DisplayName: "Errors",
		Color: map[string]interface{}{
			"mode": "thresholds",
		},
		Thresholds: &data.ThresholdsConfig{
			Mode: data.ThresholdsModeAbsolute,
			Steps: []data.Threshold{
				{Color: "green"},
				data.NewThreshold(1, "red", ""),
			},
		},
	}
}

func firstTraceString(values map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		value := traceString(values[key])
		if value != "" {
			return value
		}
	}
	return ""
}

func firstTraceTimestampMillis(values map[string]interface{}, keys ...string) (float64, bool) {
	for _, key := range keys {
		value, ok := values[key]
		if !ok {
			continue
		}
		if timestamp, ok := traceTimestampMillis(value, TimestampNanos); ok {
			return timestamp, true
		}
	}
	return 0, false
}
