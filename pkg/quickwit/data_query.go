package quickwit

import (
	"fmt"
	"regexp"
	"strconv"

	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
	"github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/simplejson"
)

const (
	defaultSize = 100
)

func buildMSR(queries []*Query, defaultTimeField string) ([]*es.SearchRequest, error) {
	ms := es.NewMultiSearchRequestBuilder()

	for _, q := range queries {
		err := isQueryWithError(q)
		if err != nil {
			return nil, err
		}

		b := ms.Search(q.Interval)
		b.Size(0)
		filters := b.Query().Bool().Filter()
		filters.AddDateRangeFilter(defaultTimeField, q.RangeTo, q.RangeFrom)
		filters.AddQueryStringFilter(q.RawQuery, true, "AND")

		if isLogsQuery(q) {
			processLogsQuery(q, b, q.RangeFrom, q.RangeTo, defaultTimeField)
		} else if isDocumentQuery(q) {
			processDocumentQuery(q, b, q.RangeFrom, q.RangeTo, defaultTimeField)
		} else {
			// Otherwise, it is a time series query and we process it
			processTimeSeriesQuery(q, b, q.RangeFrom, q.RangeTo, defaultTimeField)
		}
	}

	return ms.Build()
}

func setFloatPath(settings *simplejson.Json, path ...string) {
	if stringValue, err := settings.GetPath(path...).String(); err == nil {
		if value, err := strconv.ParseFloat(stringValue, 64); err == nil {
			settings.SetPath(path, value)
		}
	}
}

func setIntPath(settings *simplejson.Json, path ...string) {
	if stringValue, err := settings.GetPath(path...).String(); err == nil {
		if value, err := strconv.ParseInt(stringValue, 10, 64); err == nil {
			settings.SetPath(path, value)
		}
	}
}

// Casts values to float when required by Elastic's query DSL
func (metricAggregation MetricAgg) generateSettingsForDSL() map[string]interface{} {
	switch metricAggregation.Type {
	case "moving_avg":
		setFloatPath(metricAggregation.Settings, "window")
		setFloatPath(metricAggregation.Settings, "predict")
		setFloatPath(metricAggregation.Settings, "settings", "alpha")
		setFloatPath(metricAggregation.Settings, "settings", "beta")
		setFloatPath(metricAggregation.Settings, "settings", "gamma")
		setFloatPath(metricAggregation.Settings, "settings", "period")
	case "serial_diff":
		setFloatPath(metricAggregation.Settings, "lag")
	case "percentiles":
		// Quickwit only suppport percents in integers or floats
		percents := metricAggregation.Settings.GetPath("percents").MustStringArray()
		floatPercents := make([]float64, len(percents))
		for i, p := range percents {
			floatPercents[i], _ = strconv.ParseFloat(p, 64)
		}
		metricAggregation.Settings.SetPath([]string{"percents"}, floatPercents)
	}

	if isMetricAggregationWithInlineScriptSupport(metricAggregation.Type) {
		scriptValue, err := metricAggregation.Settings.GetPath("script").String()
		if err != nil {
			// the script is stored using the old format : `script:{inline: "value"}` or is not set
			scriptValue, err = metricAggregation.Settings.GetPath("script", "inline").String()
		}

		if err == nil {
			metricAggregation.Settings.SetPath([]string{"script"}, scriptValue)
		}
	}

	return metricAggregation.Settings.MustMap()
}

func (bucketAgg BucketAgg) generateSettingsForDSL() map[string]interface{} {
	setIntPath(bucketAgg.Settings, "min_doc_count")

	return bucketAgg.Settings.MustMap()
}

func addDateHistogramAgg(aggBuilder es.AggBuilder, bucketAgg *BucketAgg, timeFrom, timeTo int64, timeField string) (es.AggBuilder, error) {
	// If no field is specified, use the time field
	field := bucketAgg.Field
	if field == "" {
		field = timeField
	}

	// Validate that we have a valid field name to prevent downstream errors
	if field == "" {
		return aggBuilder, fmt.Errorf("date_histogram aggregation '%s' has no field specified and datasource timeField is empty", bucketAgg.ID)
	}

	aggBuilder.DateHistogram(bucketAgg.ID, field, func(a *es.DateHistogramAgg, b es.AggBuilder) {
		a.FixedInterval = bucketAgg.Settings.Get("interval").MustString("auto")
		a.MinDocCount = bucketAgg.Settings.Get("min_doc_count").MustInt(0)
		a.ExtendedBounds = &es.ExtendedBounds{Min: timeFrom, Max: timeTo}
		// a.Format = bucketAgg.Settings.Get("format").MustString(es.DateFormatEpochMS)

		if a.FixedInterval == "auto" {
			// note this is not really a valid grafana-variable-handling,
			// because normally this would not match `$__interval_ms`,
			// but because how we apply these in the go-code, this will work
			// correctly, and becomes something like `500ms`.
			// a nicer way would be to use `${__interval_ms}ms`, but
			// that format is not recognized where we apply these variables
			// in the elasticsearch datasource
			a.FixedInterval = "$__interval_msms"
		}

		if offset, err := bucketAgg.Settings.Get("offset").String(); err == nil {
			a.Offset = offset
		}

		if missing, err := bucketAgg.Settings.Get("missing").String(); err == nil {
			a.Missing = &missing
		}

		if timezone, err := bucketAgg.Settings.Get("timeZone").String(); err == nil {
			if timezone != "utc" {
				a.TimeZone = timezone
			}
		}

		aggBuilder = b
	})

	return aggBuilder, nil
}

func addHistogramAgg(aggBuilder es.AggBuilder, bucketAgg *BucketAgg) es.AggBuilder {
	aggBuilder.Histogram(bucketAgg.ID, bucketAgg.Field, func(a *es.HistogramAgg, b es.AggBuilder) {
		a.Interval = stringToIntWithDefaultValue(bucketAgg.Settings.Get("interval").MustString(), 1000)
		a.MinDocCount = bucketAgg.Settings.Get("min_doc_count").MustInt(0)

		if missing, err := bucketAgg.Settings.Get("missing").Int(); err == nil {
			a.Missing = &missing
		}

		aggBuilder = b
	})

	return aggBuilder
}

func addTermsAgg(aggBuilder es.AggBuilder, bucketAgg *BucketAgg, metrics []*MetricAgg) es.AggBuilder {
	aggBuilder.Terms(bucketAgg.ID, bucketAgg.Field, func(a *es.TermsAggregation, b es.AggBuilder) {
		if size, err := bucketAgg.Settings.Get("size").Int(); err == nil {
			a.Size = size
		} else {
			a.Size = stringToIntWithDefaultValue(bucketAgg.Settings.Get("size").MustString(), defaultSize)
		}
		if shard_size, err := bucketAgg.Settings.Get("shard_size").Int(); err == nil {
			a.ShardSize = shard_size
		} else {
			a.ShardSize = stringToIntWithDefaultValue(bucketAgg.Settings.Get("shard_size").MustString(), defaultSize)
		}

		if minDocCount, err := bucketAgg.Settings.Get("min_doc_count").Int(); err == nil {
			a.MinDocCount = &minDocCount
		}
		if missing, err := bucketAgg.Settings.Get("missing").String(); err == nil {
			a.Missing = &missing
		}

		if orderBy, err := bucketAgg.Settings.Get("orderBy").String(); err == nil {
			/*
			   The format for extended stats and percentiles is {metricId}[bucket_path]
			   for everything else it's just {metricId}, _count, _term, or _key
			*/
			metricIdRegex := regexp.MustCompile(`^(\d+)`)
			metricId := metricIdRegex.FindString(orderBy)

			if len(metricId) > 0 {
				for _, m := range metrics {
					if m.ID == metricId {
						if m.Type == "count" {
							a.Order["_count"] = bucketAgg.Settings.Get("order").MustString("desc")
						} else {
							a.Order[orderBy] = bucketAgg.Settings.Get("order").MustString("desc")
							b.Metric(m.ID, m.Type, m.Field, nil)
						}
						break
					}
				}
			} else {
				a.Order[orderBy] = bucketAgg.Settings.Get("order").MustString("desc")
			}
		}

		aggBuilder = b
	})

	return aggBuilder
}

func addNestedAgg(aggBuilder es.AggBuilder, bucketAgg *BucketAgg) es.AggBuilder {
	aggBuilder.Nested(bucketAgg.ID, bucketAgg.Field, func(a *es.NestedAggregation, b es.AggBuilder) {
		aggBuilder = b
	})

	return aggBuilder
}

func addFiltersAgg(aggBuilder es.AggBuilder, bucketAgg *BucketAgg) es.AggBuilder {
	filters := make(map[string]interface{})
	for _, filter := range bucketAgg.Settings.Get("filters").MustArray() {
		json := simplejson.NewFromAny(filter)
		query := json.Get("query").MustString()
		label := json.Get("label").MustString()
		if label == "" {
			label = query
		}
		filters[label] = &es.QueryStringFilter{Query: query, AnalyzeWildcard: true}
	}

	if len(filters) > 0 {
		aggBuilder.Filters(bucketAgg.ID, func(a *es.FiltersAggregation, b es.AggBuilder) {
			a.Filters = filters
			aggBuilder = b
		})
	}

	return aggBuilder
}

func addGeoHashGridAgg(aggBuilder es.AggBuilder, bucketAgg *BucketAgg) es.AggBuilder {
	aggBuilder.GeoHashGrid(bucketAgg.ID, bucketAgg.Field, func(a *es.GeoHashGridAggregation, b es.AggBuilder) {
		a.Precision = bucketAgg.Settings.Get("precision").MustInt(3)
		aggBuilder = b
	})

	return aggBuilder
}

func getPipelineAggField(m *MetricAgg) string {
	// In frontend we are using Field as pipelineAggField
	// There might be historical reason why in backend we were using PipelineAggregate as pipelineAggField
	// So for now let's check Field first and then PipelineAggregate to ensure that we are not breaking anything
	// TODO: Investigate, if we can remove check for PipelineAggregate
	pipelineAggField := m.Field

	if pipelineAggField == "" {
		pipelineAggField = m.PipelineAggregate
	}
	return pipelineAggField
}

func isQueryWithError(query *Query) error {
	if len(query.BucketAggs) == 0 {
		// If no aggregations, only document and logs queries are valid
		if len(query.Metrics) == 0 || !(isLogsQuery(query) || isDocumentQuery(query)) {
			return fmt.Errorf("invalid query, missing metrics and aggregations")
		}
	} else {
		// Validate bucket aggregations have valid fields where required
		for _, bucketAgg := range query.BucketAggs {
			// Check which aggregation types require fields
			switch bucketAgg.Type {
			case dateHistType:
				// For date_histogram, field can be empty (will use timeField as fallback)
				// Validation will happen at query processing time
				continue
			case histogramType, termsType, geohashGridType, nestedType:
				// These aggregation types require a field
				if bucketAgg.Field == "" {
					return fmt.Errorf("invalid query, bucket aggregation '%s' (type: %s) is missing required field", bucketAgg.ID, bucketAgg.Type)
				}
			case filtersType:
				// Filters aggregations don't need a field
				continue
			default:
				// For unknown aggregation types, be conservative and require field
				if bucketAgg.Field == "" {
					return fmt.Errorf("invalid query, bucket aggregation '%s' (type: %s) is missing required field", bucketAgg.ID, bucketAgg.Type)
				}
			}
		}
	}
	return nil
}

func isLogsQuery(query *Query) bool {
	return query.Metrics[0].Type == logsType
}

func isDocumentQuery(query *Query) bool {
	return isRawDataQuery(query) || isRawDocumentQuery(query)
}

func isRawDataQuery(query *Query) bool {
	return query.Metrics[0].Type == rawDataType
}

func isRawDocumentQuery(query *Query) bool {
	return query.Metrics[0].Type == rawDocumentType
}

func processLogsQuery(q *Query, b *es.SearchRequestBuilder, from, to int64, defaultTimeField string) {
	metric := q.Metrics[0]
	sort := es.SortOrderDesc
	if metric.Settings.Get("sortDirection").MustString() == "asc" {
		// This is currently used only for log context query
		sort = es.SortOrderAsc
	}
	b.Sort(sort, defaultTimeField, "epoch_nanos_int")
	b.Size(stringToIntWithDefaultValue(metric.Settings.Get("limit").MustString(), defaultSize))
	// TODO when hightlight is supported in quickwit
	// b.AddHighlight()

	// This is currently used only for log context query to get
	// log lines before and after the selected log line
	searchAfter := metric.Settings.Get("searchAfter").MustArray()
	for _, value := range searchAfter {
		b.AddSearchAfter(value)
	}
}

func processDocumentQuery(q *Query, b *es.SearchRequestBuilder, from, to int64, defaultTimeField string) {
	metric := q.Metrics[0]
	b.Sort(es.SortOrderDesc, defaultTimeField, "epoch_nanos_int")
	b.Sort(es.SortOrderDesc, "_doc", "")
	// Note: not supported in Quickwit
	// b.AddDocValueField(defaultTimeField)
	b.Size(stringToIntWithDefaultValue(metric.Settings.Get("size").MustString(), defaultSize))
}

func processTimeSeriesQuery(q *Query, b *es.SearchRequestBuilder, from, to int64, defaultTimeField string) error {
	aggBuilder := b.Agg()
	// Process buckets
	// iterate backwards to create aggregations bottom-down
	for _, bucketAgg := range q.BucketAggs {
		bucketAgg.Settings = simplejson.NewFromAny(
			bucketAgg.generateSettingsForDSL(),
		)
		switch bucketAgg.Type {
		case dateHistType:
			var err error
			aggBuilder, err = addDateHistogramAgg(aggBuilder, bucketAgg, from, to, defaultTimeField)
			if err != nil {
				return err
			}
		case histogramType:
			aggBuilder = addHistogramAgg(aggBuilder, bucketAgg)
		case filtersType:
			aggBuilder = addFiltersAgg(aggBuilder, bucketAgg)
		case termsType:
			aggBuilder = addTermsAgg(aggBuilder, bucketAgg, q.Metrics)
		case geohashGridType:
			aggBuilder = addGeoHashGridAgg(aggBuilder, bucketAgg)
		case nestedType:
			aggBuilder = addNestedAgg(aggBuilder, bucketAgg)
		}
	}

	// Process metrics
	for _, m := range q.Metrics {
		m := m

		if m.Type == countType {
			continue
		}

		if isPipelineAgg(m.Type) {
			if isPipelineAggWithMultipleBucketPaths(m.Type) {
				if len(m.PipelineVariables) > 0 {
					bucketPaths := map[string]interface{}{}
					for name, pipelineAgg := range m.PipelineVariables {
						if _, err := strconv.Atoi(pipelineAgg); err == nil {
							var appliedAgg *MetricAgg
							for _, pipelineMetric := range q.Metrics {
								if pipelineMetric.ID == pipelineAgg {
									appliedAgg = pipelineMetric
									break
								}
							}
							if appliedAgg != nil {
								if appliedAgg.Type == countType {
									bucketPaths[name] = "_count"
								} else {
									bucketPaths[name] = pipelineAgg
								}
							}
						}
					}

					aggBuilder.Pipeline(m.ID, m.Type, bucketPaths, func(a *es.PipelineAggregation) {
						a.Settings = m.generateSettingsForDSL()
					})
				} else {
					continue
				}
			} else {
				pipelineAggField := getPipelineAggField(m)
				if _, err := strconv.Atoi(pipelineAggField); err == nil {
					var appliedAgg *MetricAgg
					for _, pipelineMetric := range q.Metrics {
						if pipelineMetric.ID == pipelineAggField {
							appliedAgg = pipelineMetric
							break
						}
					}
					if appliedAgg != nil {
						bucketPath := pipelineAggField
						if appliedAgg.Type == countType {
							bucketPath = "_count"
						}

						aggBuilder.Pipeline(m.ID, m.Type, bucketPath, func(a *es.PipelineAggregation) {
							a.Settings = m.generateSettingsForDSL()
						})
					}
				} else {
					continue
				}
			}
		} else {
			aggBuilder.Metric(m.ID, m.Type, m.Field, func(a *es.MetricAggregation) {
				a.Settings = m.generateSettingsForDSL()
			})
		}
	}

	return nil
}

func stringToIntWithDefaultValue(valueStr string, defaultValue int) int {
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		value = defaultValue
	}
	// In our case, 0 is not a valid value and in this case we default to defaultValue
	if value == 0 {
		value = defaultValue
	}
	return value
}
