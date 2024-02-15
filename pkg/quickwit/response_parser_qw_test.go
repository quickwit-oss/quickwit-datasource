package quickwit

import (
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
	"github.com/stretchr/testify/require"
)

func TestProcessLogsResponseWithDifferentTimeOutputFormat(t *testing.T) {
	t.Run("Log query with datetime output in nanoseconds", func(t *testing.T) {
		query := []byte(`
				[
					{
					  "refId": "A",
					  "metrics": [{ "type": "logs"}],
					  "bucketAggs": [
						{
						  "type": "date_histogram",
						  "settings": { "interval": "auto" },
						  "id": "2"
						}
					  ],
					  "key": "Q-1561369883389-0.7611823271062786-0",
					  "query": "hello AND message",
						"sort":[{"testtime":"desc"}]
					}
				]
			`)

		response := []byte(`
				{
					"responses": [
					  {
						"aggregations": {},
						"hits": {
						  "hits": [
							{
							  "_id": "fdsfs",
							  "_type": "_doc",
							  "_index": "mock-index",
							  "_source": {
								"testtime": 1684398201000000000,
								"host": "djisaodjsoad",
								"number": 1,
								"line": "hello, i am a message",
								"level": "debug",
								"fields": { "lvl": "debug" },
								"sort":[1684398201000000000]
							  }
							}
						  ]
						}
					  }
					]
				}
			`)

		configuredFields := es.ConfiguredFields{
			TimeField:       "testtime",
			LogMessageField: "line",
			LogLevelField:   "lvl",
		}
		result, _ := queryDataTestWithResponseCode(query, 200, response, configuredFields)
		frames := result.response.Responses["A"].Frames
		logsFrame := frames[0]
		logsFieldMap := make(map[string]*data.Field)
		for _, field := range logsFrame.Fields {
			logsFieldMap[field.Name] = field
		}
		expectedTimeValue := time.Unix(1684398201, 0)
		require.Contains(t, logsFieldMap, "testtime")
		require.Equal(t, data.FieldTypeNullableTime, logsFieldMap["testtime"].Type())
		require.Equal(t, &expectedTimeValue, logsFieldMap["testtime"].At(0))
	})

	t.Run("Log query with datetime output in microseconds", func(t *testing.T) {
		query := []byte(`
				[
					{
					  "refId": "A",
					  "metrics": [{ "type": "logs"}],
					  "bucketAggs": [
						{
						  "type": "date_histogram",
						  "settings": { "interval": "auto" },
						  "id": "2"
						}
					  ],
					  "key": "Q-1561369883389-0.7611823271062786-0",
					  "query": "hello AND message",
						"sort":[{"testtime":"desc"}]
					}
				]
			`)

		response := []byte(`
				{
					"responses": [
					  {
						"aggregations": {},
						"hits": {
						  "hits": [
							{
							  "_id": "fdsfs",
							  "_type": "_doc",
							  "_index": "mock-index",
							  "_source": {
								"testtime": 1684398201000000,
								"host": "djisaodjsoad",
								"number": 1,
								"line": "hello, i am a message",
								"level": "debug",
								"fields": { "lvl": "debug" }
							  },
								"sort":[1684398201000000000]
							}
						  ]
						}
					  }
					]
				}
			`)

		configuredFields := es.ConfiguredFields{
			TimeField:       "testtime",
			LogMessageField: "line",
			LogLevelField:   "lvl",
		}
		result, _ := queryDataTestWithResponseCode(query, 200, response, configuredFields)
		frames := result.response.Responses["A"].Frames
		logsFrame := frames[0]
		logsFieldMap := make(map[string]*data.Field)
		for _, field := range logsFrame.Fields {
			logsFieldMap[field.Name] = field
		}
		expectedTimeValue := time.Unix(1684398201, 0)
		require.Contains(t, logsFieldMap, "testtime")
		require.Equal(t, data.FieldTypeNullableTime, logsFieldMap["testtime"].Type())
		require.Equal(t, &expectedTimeValue, logsFieldMap["testtime"].At(0))
	})

	t.Run("Log query with datetime output in milliseconds", func(t *testing.T) {
		query := []byte(`
				[
					{
					  "refId": "A",
					  "metrics": [{ "type": "logs"}],
					  "bucketAggs": [
						{
						  "type": "date_histogram",
						  "settings": { "interval": "auto" },
						  "id": "2"
						}
					  ],
					  "key": "Q-1561369883389-0.7611823271062786-0",
					  "query": "hello AND message",
						"sort":[{"testtime":"desc"}]
					}
				]
			`)

		response := []byte(`
				{
					"responses": [
					  {
						"aggregations": {},
						"hits": {
						  "hits": [
							{
							  "_id": "fdsfs",
							  "_type": "_doc",
							  "_index": "mock-index",
							  "_source": {
								"testtime": 1684398201000,
								"host": "djisaodjsoad",
								"number": 1,
								"line": "hello, i am a message",
								"level": "debug",
								"fields": { "lvl": "debug" }
							  },
								"sort":[1684398201000000000]
							}
						  ]
						}
					  }
					]
				}
			`)

		configuredFields := es.ConfiguredFields{
			TimeField:       "testtime",
			LogMessageField: "line",
			LogLevelField:   "lvl",
		}
		result, _ := queryDataTestWithResponseCode(query, 200, response, configuredFields)
		frames := result.response.Responses["A"].Frames
		logsFrame := frames[0]
		logsFieldMap := make(map[string]*data.Field)
		for _, field := range logsFrame.Fields {
			logsFieldMap[field.Name] = field
		}
		expectedTimeValue := time.Unix(1684398201, 0)
		require.Contains(t, logsFieldMap, "testtime")
		require.Equal(t, data.FieldTypeNullableTime, logsFieldMap["testtime"].Type())
		require.Equal(t, &expectedTimeValue, logsFieldMap["testtime"].At(0))
	})

	t.Run("Log query with datetime output in seconds", func(t *testing.T) {
		query := []byte(`
				[
					{
					  "refId": "A",
					  "metrics": [{ "type": "logs"}],
					  "bucketAggs": [
						{
						  "type": "date_histogram",
						  "settings": { "interval": "auto" },
						  "id": "2"
						}
					  ],
					  "key": "Q-1561369883389-0.7611823271062786-0",
					  "query": "hello AND message",
						"sort":[{"testtime":"desc"}]
					}
				]
			`)

		response := []byte(`
				{
					"responses": [
					  {
						"aggregations": {},
						"hits": {
						  "hits": [
							{
							  "_id": "fdsfs",
							  "_type": "_doc",
							  "_index": "mock-index",
							  "_source": {
								"testtime": 1684398201,
								"host": "djisaodjsoad",
								"number": 1,
								"line": "hello, i am a message",
								"level": "debug",
								"fields": { "lvl": "debug" }
							  },
								"sort":[1684398201000000000]
							}
						  ]
						}
					  }
					]
				}
			`)

		configuredFields := es.ConfiguredFields{
			TimeField:       "testtime",
			LogMessageField: "line",
			LogLevelField:   "lvl",
		}
		result, _ := queryDataTestWithResponseCode(query, 200, response, configuredFields)
		frames := result.response.Responses["A"].Frames
		logsFrame := frames[0]
		logsFieldMap := make(map[string]*data.Field)
		for _, field := range logsFrame.Fields {
			logsFieldMap[field.Name] = field
		}
		expectedTimeValue := time.Unix(1684398201, 0)
		require.Contains(t, logsFieldMap, "testtime")
		require.Equal(t, data.FieldTypeNullableTime, logsFieldMap["testtime"].Type())
		require.Equal(t, &expectedTimeValue, logsFieldMap["testtime"].At(0))
	})
}

func TestConvertToTime(t *testing.T) {
	t.Run("Test parse unix timestamps nanosecs of float type", func(t *testing.T) {
		inputValue := interface{}(1234567890000000000.0)
		value, _ := ParseToTime(inputValue)
		require.Equal(t, time.Unix(1234567890, 0), value)
	})
}
