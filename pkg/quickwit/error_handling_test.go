package quickwit

import (
	"testing"

	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
	"github.com/stretchr/testify/require"
)

func TestErrorAvgMissingField(t *testing.T) {
	query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [
			{ "type": "avg", "id": "1" }
			],
			"bucketAggs": [
			{ "type": "date_histogram", "field": "@timestamp", "id": "2" }
			]
		}
	]
	`)

	response := []byte(`
	{
		"error": {
		  "reason": "Required one of fields [field, script], but none were specified. ",
		  "root_cause": [
			{
			  "reason": "Required one of fields [field, script], but none were specified. ",
			  "type": "illegal_argument_exception"
			}
		  ],
		  "type": "illegal_argument_exception"
		},
		"status": 400
	  }
	`)

	configuredFields := es.ConfiguredFields{
		TimeOutputFormat: Rfc3339,
		TimeField:        "testtime",
		LogMessageField:  "line",
		LogLevelField:    "lvl",
	}
	_, err := queryDataTestWithResponseCode(query, 400, response, configuredFields)
	require.Error(t, err)
}

func TestErrorAvgMissingFieldNoDetailedErrors(t *testing.T) {
	query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [
			{ "type": "avg", "id": "1" }
			],
			"bucketAggs": [
			{ "type": "date_histogram", "field": "@timestamp", "id": "2" }
			]
		}
	]
	`)

	// you can receive such an error if you configure elastic with:
	// http.detailed_errors.enabled=false
	response := []byte(`
	{ "error": "No ElasticsearchException found", "status": 400 }
	`)

	configuredFields := es.ConfiguredFields{
		TimeOutputFormat: Rfc3339,
		TimeField:        "testtime",
		LogMessageField:  "line",
		LogLevelField:    "lvl",
	}
	_, err := queryDataTestWithResponseCode(query, 400, response, configuredFields)
	require.Error(t, err)
}

func TestErrorTooManyDateHistogramBuckets(t *testing.T) {
	query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [
			{ "type": "count", "id": "1" }
			],
			"bucketAggs": [
			{ "type": "date_histogram", "field": "@timestamp", "settings": { "interval": "10s" }, "id": "2" }
			]
		}
	]
	`)

	response := []byte(`
	{
		"responses": [
			{
				"error": {
					"caused_by": {
						"max_buckets": 65536,
						"reason": "Trying to create too many buckets. Must be less than or equal to: [65536].",
						"type": "too_many_buckets_exception"
					},
					"reason": "",
					"root_cause": [],
					"type": "search_phase_execution_exception"
				},
				"status": 503
			}
		]
	}
	`)

	configuredFields := es.ConfiguredFields{
		TimeOutputFormat: Rfc3339,
		TimeField:        "testtime",
		LogMessageField:  "line",
		LogLevelField:    "lvl",
	}
	result, err := queryDataTestWithResponseCode(query, 200, response, configuredFields)
	require.NoError(t, err)

	require.Len(t, result.response.Responses, 1)

	dataResponse, ok := result.response.Responses["A"]

	require.True(t, ok)
	require.Len(t, dataResponse.Frames, 0)
	require.ErrorContains(t, dataResponse.Error, "Trying to create too many buckets. Must be less than or equal to: [65536].")
}

func TestNonElasticError(t *testing.T) {
	query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [
			{ "type": "count", "id": "1" }
			],
			"bucketAggs": [
			{ "type": "date_histogram", "field": "@timestamp", "settings": { "interval": "10s" }, "id": "2" }
			]
		}
	]
	`)

	// this scenario is about an error-message that does not come directly from elastic,
	// but from a middleware/proxy server that for example reports that it is forbidden
	// to access the database for some reason.
	response := []byte(`Access to the database is forbidden`)

	configuredFields := es.ConfiguredFields{
		TimeOutputFormat: Rfc3339,
		TimeField:        "testtime",
		LogMessageField:  "line",
		LogLevelField:    "lvl",
	}
	_, err := queryDataTestWithResponseCode(query, 403, response, configuredFields)
	// FIXME: we should return something better.
	// currently it returns the error-message about being unable to decode JSON
	// it is not 100% clear what we should return to the browser
	// (and what to debug-log for example), we could return
	// at least something like "unknown response, http status code 403"
	require.ErrorContains(t, err, "invalid character")
}
