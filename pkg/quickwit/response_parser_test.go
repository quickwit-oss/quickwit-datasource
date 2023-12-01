package quickwit

import (
	"encoding/json"
	"flag"
	"fmt"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/experimental"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
)

var update = flag.Bool("update", true, "update golden files")

func TestProcessLogsResponse(t *testing.T) {
	t.Run("Simple log query response", func(t *testing.T) {
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
					  "query": "hello AND message"
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
								"testtime": "2019-06-24T09:51:19.765Z",
								"host": "djisaodjsoad",
								"number": 1,
								"line": "hello, i am a message",
								"level": "debug",
								"fields": { "lvl": "debug" }
							  },
							  "highlight": {
								"message": [
								  "@HIGHLIGHT@hello@/HIGHLIGHT@, i am a @HIGHLIGHT@message@/HIGHLIGHT@"
								]
							  }
							},
							{
							  "_id": "kdospaidopa",
							  "_type": "_doc",
							  "_index": "mock-index",
							  "_source": {
								"testtime": "2019-06-24T09:52:19.765Z",
								"host": "dsalkdakdop",
								"number": 2,
								"line": "hello, i am also message",
								"level": "error",
								"fields": { "lvl": "info" }
							  },
							  "highlight": {
								"message": [
								  "@HIGHLIGHT@hello@/HIGHLIGHT@, i am a @HIGHLIGHT@message@/HIGHLIGHT@"
								]
							  }
							}
						  ]
						}
					  }
					]
				}
			`)

		t.Run("creates correct data frame fields", func(t *testing.T) {
			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 1)

			logsFrame := frames[0]

			meta := logsFrame.Meta
			require.Equal(t, data.VisTypeLogs, string(meta.PreferredVisualization))

			logsFieldMap := make(map[string]*data.Field)
			for _, field := range logsFrame.Fields {
				logsFieldMap[field.Name] = field
			}

			require.Contains(t, logsFieldMap, "testtime")
			require.Equal(t, data.FieldTypeNullableTime, logsFieldMap["testtime"].Type())

			require.Contains(t, logsFieldMap, "host")
			require.Equal(t, data.FieldTypeNullableString, logsFieldMap["host"].Type())

			require.Contains(t, logsFieldMap, "line")
			require.Equal(t, data.FieldTypeNullableString, logsFieldMap["line"].Type())

			require.Contains(t, logsFieldMap, "number")
			require.Equal(t, data.FieldTypeNullableFloat64, logsFieldMap["number"].Type())

			require.Contains(t, logsFieldMap, "_source")
			require.Equal(t, data.FieldTypeNullableJSON, logsFieldMap["_source"].Type())

			actualJson1, err := json.Marshal(logsFieldMap["_source"].At(0).(*json.RawMessage))
			require.NoError(t, err)
			actualJson2, err := json.Marshal(logsFieldMap["_source"].At(1).(*json.RawMessage))
			require.NoError(t, err)

			expectedJson1 := `
					{
						"fields.lvl": "debug",
						"host": "djisaodjsoad",
						"level": "debug",
						"line": "hello, i am a message",
						"number": 1,
						"testtime": "2019-06-24T09:51:19.765Z",
						"line": "hello, i am a message"
					}
					`

			expectedJson2 := `
					{
						"testtime": "2019-06-24T09:52:19.765Z",
						"host": "dsalkdakdop",
						"number": 2,
						"line": "hello, i am also message",
						"level": "error",
						"fields.lvl": "info"
					}`

			require.JSONEq(t, expectedJson1, string(actualJson1))
			require.JSONEq(t, expectedJson2, string(actualJson2))
		})

		t.Run("creates correct level field", func(t *testing.T) {
			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.True(t, len(frames) > 0)

			requireFrameLength(t, frames[0], 2)
			fieldMap := make(map[string]*data.Field)
			for _, field := range frames[0].Fields {
				fieldMap[field.Name] = field
			}

			require.Contains(t, fieldMap, "level")
			field := fieldMap["level"]

			requireStringAt(t, "debug", field, 0)
			requireStringAt(t, "error", field, 1)
		})
	})
	t.Run("Empty response", func(t *testing.T) {
		query := []byte(`
				[
					{
					  "refId": "A",
					  "metrics": [{ "type": "logs", "id": "2" }],
					  "bucketAggs": [],
					  "key": "Q-1561369883389-0.7611823271062786-0",
					  "query": "hello AND message"
					}
				]
			`)

		response := []byte(`
			{
				"responses": [
				  {
					"hits": { "hits": [] },
					"aggregations": {},
					"status": 200
				  }
				]
			}
		`)

		result, err := queryDataTest(query, response)
		require.NoError(t, err)

		require.Len(t, result.response.Responses, 1)
		frames := result.response.Responses["A"].Frames
		require.Len(t, frames, 1)
	})

	t.Run("Log query with nested fields", func(t *testing.T) {
		targets := map[string]string{
			"A": `{
					"metrics": [{ "type": "logs" }]
				}`,
		}

		response := `{
  			"responses":[
  			  {
  			    "hits":{
  			      "total":{
  			        "value":109,
  			        "relation":"eq"
  			      },
  			      "max_score":null,
  			      "hits":[
  			        {
  			          "_index":"logs-2023.02.08",
  			          "_id":"GB2UMYYBfCQ-FCMjayJa",
  			          "_score":null,
  			          "_source":{
  			            "@timestamp":"2023-02-08T15:10:55.830Z",
  			            "line":"log text  [479231733]",
  			            "counter":"109",
  			            "float":58.253758485091,
  			            "label":"val1",
  			            "lvl":"info",
  			            "location":"17.089705232090438, 41.62861966340297",
										"nested": {
											"field": {
												"double_nested": "value"
											}
										},
  			            "shapes":[
  			              {
  			                "type":"triangle"
  			              },
  			              {
  			                "type":"square"
  			              }
  			            ],
										"xyz": null
  			          },
  			          "sort":[
  			            1675869055830,
  			            4
  			          ]
  			        },
  			        {
  			          "_index":"logs-2023.02.08",
  			          "_id":"Fx2UMYYBfCQ-FCMjZyJ_",
  			          "_score":null,
  			          "_source":{
  			            "@timestamp":"2023-02-08T15:10:54.835Z",
  			            "line":"log text with ANSI \u001b[31mpart of the text\u001b[0m [493139080]",
  			            "counter":"108",
  			            "float":54.5977098233944,
  			            "label":"val1",
  			            "lvl":"info",
  			            "location":"19.766305918490463, 40.42639175509792",
										"nested": {
											"field": {
												"double_nested": "value"
											}
										},
  			            "shapes":[
  			              {
  			                "type":"triangle"
  			              },
  			              {
  			                "type":"square"
  			              }
  			            ],
										"xyz": "def"
  			          },
  			          "sort":[
  			            1675869054835,
  			            7
  			          ]
  			        }
  			      ]
  			    },
  			    "status":200
  			  }
  			]
			}`

		result, err := parseTestResponse(targets, response)
		require.NoError(t, err)
		require.Len(t, result.Responses, 1)

		queryRes := result.Responses["A"]
		require.NotNil(t, queryRes)
		dataframes := queryRes.Frames
		require.Len(t, dataframes, 1)
		frame := dataframes[0]

		require.Equal(t, 12, len(frame.Fields))
		// Fields have the correct length
		require.Equal(t, 2, frame.Fields[0].Len())
		// First field is timeField
		require.Equal(t, data.FieldTypeNullableTime, frame.Fields[0].Type())
		// Second is log line
		require.Equal(t, data.FieldTypeNullableString, frame.Fields[1].Type())
		require.Equal(t, "line", frame.Fields[1].Name)
		// Correctly renames lvl field to level
		require.Equal(t, "level", frame.Fields[6].Name)
		// Correctly uses string types
		require.Equal(t, data.FieldTypeNullableString, frame.Fields[1].Type())
		// Correctly detects float64 types
		require.Equal(t, data.FieldTypeNullableFloat64, frame.Fields[4].Type())
		// Correctly detects json types
		require.Equal(t, data.FieldTypeNullableJSON, frame.Fields[2].Type())
		// Correctly flattens fields
		require.Equal(t, "nested.field.double_nested", frame.Fields[8].Name)
		require.Equal(t, data.FieldTypeNullableString, frame.Fields[8].Type())
		// Correctly detects type even if first value is null
		require.Equal(t, data.FieldTypeNullableJSON, frame.Fields[10].Type())
	})
}

func TestProcessRawDataResponse(t *testing.T) {
	t.Run("Simple raw data query", func(t *testing.T) {
		targets := map[string]string{
			"A": `{
					"metrics": [{ "type": "raw_data" }]
				}`,
		}

		response := `{
  			"responses":[
  			  {
  			    "hits":{
  			      "total":{
  			        "value":109,
  			        "relation":"eq"
  			      },
  			      "max_score":null,
  			      "hits":[
  			        {
  			          "_index":"logs-2023.02.08",
  			          "_id":"GB2UMYYBfCQ-FCMjayJa",
  			          "_score":null,
  			          "_source":{
  			            "@timestamp":"2023-02-08T15:10:55.830Z",
  			            "line":"log text  [479231733]",
  			            "counter":"109",
  			            "float":58.253758485091,
  			            "label":"val1",
  			            "level":"info",
  			            "location":"17.089705232090438, 41.62861966340297",
										"nested": {
											"field": {
												"double_nested": "value"
											}
										},
  			            "shapes":[
  			              {
  			                "type":"triangle"
  			              },
  			              {
  			                "type":"square"
  			              }
  			            ],
										"xyz": null
  			          },
  			          "sort":[
  			            1675869055830,
  			            4
  			          ]
  			        },
  			        {
  			          "_index":"logs-2023.02.08",
  			          "_id":"Fx2UMYYBfCQ-FCMjZyJ_",
  			          "_score":null,
  			          "_source":{
  			            "@timestamp":"2023-02-08T15:10:54.835Z",
  			            "line":"log text with ANSI \u001b[31mpart of the text\u001b[0m [493139080]",
  			            "counter":"108",
  			            "float":54.5977098233944,
  			            "label":"val1",
  			            "level":"info",
  			            "location":"19.766305918490463, 40.42639175509792",
										"nested": {
											"field": {
												"double_nested": "value"
											}
										},
  			            "shapes":[
  			              {
  			                "type":"triangle"
  			              },
  			              {
  			                "type":"square"
  			              }
  			            ],
										"xyz": "def"
  			          },
  			          "sort":[
  			            1675869054835,
  			            7
  			          ]
  			        }
  			      ]
  			    },
  			    "status":200
  			  }
  			]
			}`

		result, err := parseTestResponse(targets, response)
		require.NoError(t, err)
		require.Len(t, result.Responses, 1)

		queryRes := result.Responses["A"]
		require.NotNil(t, queryRes)
		dataframes := queryRes.Frames
		require.Len(t, dataframes, 1)
		frame := dataframes[0]

		require.Equal(t, 10, len(frame.Fields))
		// Fields have the correct length
		require.Equal(t, 2, frame.Fields[0].Len())
		// First field is timeField
		require.Equal(t, data.FieldTypeNullableTime, frame.Fields[0].Type())
		// Correctly uses string types
		require.Equal(t, data.FieldTypeNullableString, frame.Fields[1].Type())
		// Correctly detects float64 types
		require.Equal(t, data.FieldTypeNullableFloat64, frame.Fields[2].Type())
		// Correctly flattens fields
		require.Equal(t, "nested.field.double_nested", frame.Fields[7].Name)
		require.Equal(t, data.FieldTypeNullableString, frame.Fields[7].Type())
		// Correctly detects type even if first value is null
		require.Equal(t, data.FieldTypeNullableString, frame.Fields[9].Type())
	})

	t.Run("Raw data query filterable fields", func(t *testing.T) {
		query := []byte(`
				[
					{
						"refId": "A",
						"metrics": [{ "type": "raw_data", "id": "1" }],
						"bucketAggs": []
					}
				]
			`)

		response := []byte(`
				{
					"responses": [
					  {
						"hits": {
						  "total": { "relation": "eq", "value": 1 },
						  "hits": [
							{
							  "_id": "1",
							  "_type": "_doc",
							  "_index": "index",
							  "_source": { "sourceProp": "asd" }
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
		require.True(t, len(frames) > 0)

		for _, field := range frames[0].Fields {
			trueValue := true
			filterableConfig := data.FieldConfig{Filterable: &trueValue}

			// we need to test that the only changed setting is `filterable`
			require.Equal(t, filterableConfig, *field.Config)
		}
	})
}

func TestProcessRawDocumentResponse(t *testing.T) {
	t.Run("Simple raw document query", func(t *testing.T) {
		query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [{ "type": "raw_document", "id": "1" }],
		  "bucketAggs": []
		}
	]
	`)

		response := []byte(`
	{
		"responses": [
			{
			"hits": {
				"total": 100,
				"hits": [
				{
					"_id": "1",
					"_type": "type",
					"_index": "index",
					"_source": { "sourceProp": "asd" },
					"fields": { "fieldProp": "field" }
				},
				{
					"_source": { "sourceProp": "asd2" },
					"fields": { "fieldProp": "field2" }
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
		require.Len(t, frames, 1)
		fields := frames[0].Fields

		require.Len(t, fields, 1)
		f := fields[0]

		require.Equal(t, data.FieldTypeNullableJSON, f.Type())
		require.Equal(t, 2, f.Len())

		v := f.At(0).(*json.RawMessage)
		var jsonData map[string]interface{}
		err = json.Unmarshal(*v, &jsonData)
		require.NoError(t, err)

		require.Equal(t, "asd", jsonData["sourceProp"])
		require.Equal(t, "field", jsonData["fieldProp"])
	})
	t.Run("More complex raw document query", func(t *testing.T) {
		targets := map[string]string{
			"A": `{
					"metrics": [{ "type": "raw_document" }]
				}`,
		}

		response := `{
  			"responses":[
  			  {
  			    "hits":{
  			      "total":{
  			        "value":109,
  			        "relation":"eq"
  			      },
  			      "max_score":null,
  			      "hits":[
  			        {
  			          "_index":"logs-2023.02.08",
  			          "_id":"GB2UMYYBfCQ-FCMjayJa",
  			          "_score":null,
									"fields": {
										"test_field":"A"
									},
  			          "_source":{
  			            "@timestamp":"2023-02-08T15:10:55.830Z",
  			            "line":"log text  [479231733]",
  			            "counter":"109",
  			            "float":58.253758485091,
  			            "label":"val1",
  			            "level":"info",
  			            "location":"17.089705232090438, 41.62861966340297",
										"nested": {
											"field": {
												"double_nested": "value"
											}
										}
									}
  			        },
  			        {
  			          "_index":"logs-2023.02.08",
  			          "_id":"Fx2UMYYBfCQ-FCMjZyJ_",
  			          "_score":null,
									"fields": {
										"test_field":"A"
									},
  			          "_source":{
  			            "@timestamp":"2023-02-08T15:10:54.835Z",
  			            "line":"log text with ANSI \u001b[31mpart of the text\u001b[0m [493139080]",
  			            "counter":"108",
  			            "float":54.5977098233944,
  			            "label":"val1",
  			            "level":"info",
  			            "location":"19.766305918490463, 40.42639175509792",
										"nested": {
											"field": {
												"double_nested": "value1"
											}
										}
									}
  			        }
  			      ]
  			    },
  			    "status":200
  			  }
  			]
			}`

		result, err := parseTestResponse(targets, response)
		require.NoError(t, err)
		require.Len(t, result.Responses, 1)

		queryRes := result.Responses["A"]
		require.NotNil(t, queryRes)
		dataframes := queryRes.Frames
		require.Len(t, dataframes, 1)
		frame := dataframes[0]

		require.Equal(t, 1, len(frame.Fields))
		//Fields have the correct length
		require.Equal(t, 2, frame.Fields[0].Len())
		// The only field is the raw document
		require.Equal(t, data.FieldTypeNullableJSON, frame.Fields[0].Type())
		require.Equal(t, "A", frame.Fields[0].Name)
	})
}

func TestProcessBuckets(t *testing.T) {
	t.Run("Percentiles", func(t *testing.T) {
		t.Run("Percentiles without date histogram", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [
			{
			  "type": "percentiles",
			  "field": "value",
			  "settings": { "percents": ["75", "90"] },
			  "id": "1"
			}
		  ],
		  "bucketAggs": [{ "type": "terms", "field": "id", "id": "3" }]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "3": {
				"buckets": [
				  {
					"1": { "values": { "90": 5.5, "75": 3.3 } },
					"doc_count": 10,
					"key": "id1"
				  },
				  {
					"1": { "values": { "75": 2.3, "90": 4.5 } },
					"doc_count": 15,
					"key": "id2"
				  }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 1)
			requireFrameLength(t, frames[0], 2)

			require.Len(t, frames[0].Fields, 3)

			f1 := frames[0].Fields[0]
			f2 := frames[0].Fields[1]
			f3 := frames[0].Fields[2]

			require.Equal(t, "id", f1.Name)
			require.Equal(t, "p75 value", f2.Name)
			require.Equal(t, "p90 value", f3.Name)

			requireStringAt(t, "id1", f1, 0)
			requireStringAt(t, "id2", f1, 1)

			requireFloatAt(t, 3.3, f2, 0)
			requireFloatAt(t, 2.3, f2, 1)

			requireFloatAt(t, 5.5, f3, 0)
			requireFloatAt(t, 4.5, f3, 1)
		})
		t.Run("percentiles 2 frames", func(t *testing.T) {
			query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [
			{
				"type": "percentiles",
				"settings": { "percents": ["75", "90"] },
				"id": "1",
				"field": "@value"
			}
			],
			"bucketAggs": [
			{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
			]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "3": {
				"buckets": [
				  {
					"1": { "values": { "75": 3.3, "90": 5.5 } },
					"doc_count": 10,
					"key": 1000
				  },
				  {
					"1": { "values": { "75": 2.3, "90": 4.5 } },
					"doc_count": 15,
					"key": 2000
				  }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 2)

			requireFrameLength(t, frames[0], 2)
			requireTimeSeriesName(t, "p75 @value", frames[0])
			requireTimeSeriesName(t, "p90 @value", frames[1])

			requireNumberValue(t, 3.3, frames[0], 0)
			requireTimeValue(t, 1000, frames[0], 0)
			requireNumberValue(t, 4.5, frames[1], 1)
		})

		t.Run("With percentiles", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "percentiles", "settings": { "percents": [75, 90] }, "id": "1" }],
          "bucketAggs": [{ "type": "date_histogram", "field": "@timestamp", "id": "3" }]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "3": {
                "buckets": [
                  {
                    "1": { "values": { "75": 3.3, "90": 5.5 } },
                    "doc_count": 10,
                    "key": 1000
                  },
                  {
                    "1": { "values": { "75": 2.3, "90": 4.5 } },
                    "doc_count": 15,
                    "key": 2000
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 2)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "p75")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "p90")
		})
	})

	t.Run("Histograms", func(t *testing.T) {
		t.Run("Histogram simple", func(t *testing.T) {
			query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [{ "type": "count", "id": "1" }],
			"bucketAggs": [{ "type": "histogram", "field": "bytes", "id": "3" }]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "3": {
				"buckets": [
				  { "doc_count": 1, "key": 1000 },
				  { "doc_count": 3, "key": 2000 },
				  { "doc_count": 2, "key": 1000 }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 1)
			requireFrameLength(t, frames[0], 3)

			fields := frames[0].Fields
			require.Len(t, fields, 2)

			field1 := fields[0]
			field2 := fields[1]

			require.Equal(t, "bytes", field1.Name)

			trueValue := true
			filterableConfig := data.FieldConfig{Filterable: &trueValue}

			// we need to test that the only changed setting is `filterable`
			require.Equal(t, filterableConfig, *field1.Config)
			require.Equal(t, "Count", field2.Name)
			// we need to test that the fieldConfig is "empty"
			require.Nil(t, field2.Config)
		})

		t.Run("Histogram response", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "count", "id": "1" }],
         "bucketAggs": [{ "type": "histogram", "field": "bytes", "id": "3" }]
				}`,
			}
			response := `{
        "responses": [
         {
           "aggregations": {
             "3": {
               "buckets": [{ "doc_count": 1, "key": 1000 }, { "doc_count": 3, "key": 2000 }, { "doc_count": 2, "key": 3000 }]
             }
           }
         }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 1)
		})
	})

	t.Run("Terms", func(t *testing.T) {
		t.Run("Terms with two bucket_script", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [
						{ "id": "1", "type": "sum", "field": "@value" },
            			{ "id": "3", "type": "max", "field": "@value" },
            			{
              				"id": "4",
              				"pipelineVariables": [{ "name": "var1", "pipelineAgg": "1" }, { "name": "var2", "pipelineAgg": "3" }],
              				"settings": { "script": "params.var1 * params.var2" },
              				"type": "bucket_script"
						},
            			{
							"id": "5",
							"pipelineVariables": [{ "name": "var1", "pipelineAgg": "1" }, { "name": "var2", "pipelineAgg": "3" }],
							"settings": { "script": "params.var1 * params.var2 * 2" },
							"type": "bucket_script"
					  }
					],
          "bucketAggs": [{ "type": "terms", "field": "@timestamp", "id": "2" }]
				}`,
			}
			response := `{
				"responses": [
					{
						"aggregations": {
						"2": {
							"buckets": [
							{
								"1": { "value": 2 },
								"3": { "value": 3 },
								"4": { "value": 6 },
								"5": { "value": 24 },
								"doc_count": 60,
								"key": 1000
							},
							{
								"1": { "value": 3 },
								"3": { "value": 4 },
								"4": { "value": 12 },
								"5": { "value": 48 },
								"doc_count": 60,
								"key": 2000
							}
							]
						}
						}
					}
				]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 1)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 5)
			require.Equal(t, frame.Fields[0].Name, "@timestamp")
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, "Sum")
			require.Equal(t, frame.Fields[1].Len(), 2)
			require.Equal(t, frame.Fields[2].Name, "Max")
			require.Equal(t, frame.Fields[2].Len(), 2)
			require.Equal(t, frame.Fields[3].Name, "params.var1 * params.var2")
			require.Equal(t, frame.Fields[3].Len(), 2)
			require.Equal(t, frame.Fields[4].Name, "params.var1 * params.var2 * 2")
			require.Equal(t, frame.Fields[4].Len(), 2)
			require.Nil(t, frame.Fields[1].Config)
		})

		t.Run("With max and multiple terms agg", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
				"metrics": [
					{
						"type": "count",
						"field": "counter",
						"id": "1"
					}
				],
				"bucketAggs": [{ "type": "terms", "field": "label", "id": "2" }, { "type": "terms", "field": "level", "id": "3" }]
			}`,
			}
			response := `{
			"responses": [{
				"aggregations": {
					"2": {
						"buckets": [
							{
								"key": "val3",
								"3": {
									"buckets": [
										{ "key": "info", "doc_count": 299 }, { "key": "error", "doc_count": 10 }
									]
								}
							},
							{
								"key": "val2",
								"3": {
									"buckets": [
										{"key": "info", "doc_count": 300}, {"key": "error", "doc_count": 298 }
									]
								}
							},
							{
								"key": "val1",
								"3": {
									"buckets": [
									]
								}
							}
						]
					}
				}
			}]
		}`

			result, err := parseTestResponse(targets, response)
			assert.Nil(t, err)
			assert.Len(t, result.Responses, 1)
			frames := result.Responses["A"].Frames
			require.Len(t, frames, 1)
			requireFrameLength(t, frames[0], 4)
			require.Len(t, frames[0].Fields, 3)

			f1 := frames[0].Fields[0]
			f2 := frames[0].Fields[1]
			f3 := frames[0].Fields[2]

			require.Equal(t, "label", f1.Name)
			require.Equal(t, "level", f2.Name)
			require.Equal(t, "Count", f3.Name)

			requireStringAt(t, "val3", f1, 0)
			requireStringAt(t, "val3", f1, 1)
			requireStringAt(t, "val2", f1, 2)
			requireStringAt(t, "val2", f1, 3)

			requireStringAt(t, "info", f2, 0)
			requireStringAt(t, "error", f2, 1)
			requireStringAt(t, "info", f2, 2)
			requireStringAt(t, "error", f2, 3)

			requireFloatAt(t, 299, f3, 0)
			requireFloatAt(t, 10, f3, 1)
			requireFloatAt(t, 300, f3, 2)
			requireFloatAt(t, 298, f3, 3)
		})

		t.Run("Terms agg without date histogram", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [
			{ "type": "avg", "id": "1", "field": "@value" },
			{ "type": "count", "id": "3" }
		  ],
		  "bucketAggs": [{ "id": "2", "type": "terms", "field": "host" }]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  { "1": { "value": 1000 }, "key": "server-1", "doc_count": 369 },
				  { "1": { "value": 2000 }, "key": "server-2", "doc_count": 200 }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 1)

			frame1 := frames[0]
			requireFrameLength(t, frame1, 2)
			require.Len(t, frame1.Fields, 3)

			f1 := frame1.Fields[0]
			f2 := frame1.Fields[1]
			f3 := frame1.Fields[2]

			requireStringAt(t, "server-1", f1, 0)
			requireStringAt(t, "server-2", f1, 1)

			requireFloatAt(t, 1000.0, f2, 0)
			requireFloatAt(t, 2000.0, f2, 1)

			requireFloatAt(t, 369.0, f3, 0)
			requireFloatAt(t, 200.0, f3, 1)
		})
	})

	t.Run("Top metrics", func(t *testing.T) {
		t.Run("Top metrics 2 frames", func(t *testing.T) {
			query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [
			{
				"type": "top_metrics",
				"settings": {
				"order": "top",
				"orderBy": "@timestamp",
				"metrics": ["@value", "@anotherValue"]
				},
				"id": "1"
			}
			],
			"bucketAggs": [{ "type": "date_histogram", "id": "2" }]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  {
					"1": {
					  "top": [
						{
						  "sort": ["2021-01-01T00:00:00.000Z"],
						  "metrics": { "@value": 1, "@anotherValue": 2 }
						}
					  ]
					},
					"key": 1609459200000,
					"key_as_string": "2021-01-01T00:00:00.000Z"
				  },
				  {
					"1": {
					  "top": [
						{
						  "sort": ["2021-01-01T00:00:10.000Z"],
						  "metrics": { "@value": 1, "@anotherValue": 2 }
						}
					  ]
					},
					"key": 1609459210000,
					"key_as_string": "2021-01-01T00:00:10.000Z"
				  }
				]
			  }
			}
		  }
		]
	}
	`)

			time1, err := time.Parse(time.RFC3339, "2021-01-01T00:00:00.000Z")
			require.NoError(t, err)
			time2, err := time.Parse(time.RFC3339, "2021-01-01T00:00:10.000Z")
			require.NoError(t, err)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 2)

			frame1 := frames[0]
			frame2 := frames[1]

			requireTimeSeriesName(t, "Top Metrics @value", frame1)
			requireFrameLength(t, frame1, 2)
			requireTimeValue(t, time1.UTC().UnixMilli(), frame1, 0)
			requireTimeValue(t, time2.UTC().UnixMilli(), frame1, 1)
			requireNumberValue(t, 1, frame1, 0)
			requireNumberValue(t, 1, frame1, 1)

			requireTimeSeriesName(t, "Top Metrics @anotherValue", frame2)
			requireFrameLength(t, frame2, 2)
			requireTimeValue(t, time1.UTC().UnixMilli(), frame2, 0)
			requireTimeValue(t, time2.UTC().UnixMilli(), frame2, 1)
			requireNumberValue(t, 2, frame2, 0)
			requireNumberValue(t, 2, frame2, 1)
		})

		t.Run("With top_metrics and date_histogram agg", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
				"metrics": [
					{
						"type": "top_metrics",
						"settings": {
							"order": "desc",
							"orderBy": "@timestamp",
							"metrics": ["@value", "@anotherValue"]
						},
						"id": "1"
					}
				],
				"bucketAggs": [{ "type": "date_histogram", "field": "@timestamp", "id": "3" }]
			}`,
			}
			response := `{
			"responses": [{
				"aggregations": {
					"3": {
						"buckets": [
							{
								"key": 1609459200000,
								"key_as_string": "2021-01-01T00:00:00.000Z",
								"1": {
									"top": [
										{ "sort": ["2021-01-01T00:00:00.000Z"], "metrics": { "@value": 1, "@anotherValue": 2 } }
									]
								}
							},
							{
								"key": 1609459210000,
								"key_as_string": "2021-01-01T00:00:10.000Z",
								"1": {
									"top": [
										{ "sort": ["2021-01-01T00:00:10.000Z"], "metrics": { "@value": 1, "@anotherValue": 2 } }
									]
								}
							}
						]
					}
				}
			}]
		}`
			result, err := parseTestResponse(targets, response)
			assert.Nil(t, err)
			assert.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			assert.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			assert.NoError(t, err)
			assert.Len(t, dataframes, 2)

			frame := dataframes[0]
			assert.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Top Metrics @value")
			v, _ := frame.FloatAt(0, 0)
			assert.Equal(t, 1609459200000., v)
			v, _ = frame.FloatAt(1, 0)
			assert.Equal(t, 1., v)

			v, _ = frame.FloatAt(0, 1)
			assert.Equal(t, 1609459210000., v)
			v, _ = frame.FloatAt(1, 1)
			assert.Equal(t, 1., v)

			frame = dataframes[1]
			l, _ := frame.MarshalJSON()
			fmt.Println(string(l))
			assert.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Top Metrics @anotherValue")
			v, _ = frame.FloatAt(0, 0)
			assert.Equal(t, 1609459200000., v)
			v, _ = frame.FloatAt(1, 0)
			assert.Equal(t, 2., v)

			v, _ = frame.FloatAt(0, 1)
			assert.Equal(t, 1609459210000., v)
			v, _ = frame.FloatAt(1, 1)
			assert.Equal(t, 2., v)
		})

		t.Run("With top_metrics and terms agg", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
				"metrics": [
					{
						"type": "top_metrics",
						"settings": {
							"order": "desc",
							"orderBy": "@timestamp",
							"metrics": ["@value", "@anotherValue"]
						},
						"id": "1"
					}
				],
				"bucketAggs": [{ "type": "terms", "field": "id", "id": "3" }]
			}`,
			}
			response := `{
			"responses": [{
				"aggregations": {
					"3": {
						"buckets": [
							{
								"key": "id1",
								"1": {
									"top": [
										{ "sort": [10], "metrics": { "@value": 10, "@anotherValue": 2 } }
									]
								}
							},
							{
								"key": "id2",
								"1": {
									"top": [
										{ "sort": [5], "metrics": { "@value": 5, "@anotherValue": 2 } }
									]
								}
							}
						]
					}
				}
			}]
		}`

			result, err := parseTestResponse(targets, response)
			assert.Nil(t, err)
			assert.Len(t, result.Responses, 1)
			frames := result.Responses["A"].Frames
			require.Len(t, frames, 1)
			requireFrameLength(t, frames[0], 2)
			require.Len(t, frames[0].Fields, 3)

			f1 := frames[0].Fields[0]
			f2 := frames[0].Fields[1]
			f3 := frames[0].Fields[2]

			require.Equal(t, "id", f1.Name)
			require.Equal(t, "Top Metrics @value", f2.Name)
			require.Equal(t, "Top Metrics @anotherValue", f3.Name)

			requireStringAt(t, "id1", f1, 0)
			requireStringAt(t, "id2", f1, 1)

			requireFloatAt(t, 10, f2, 0)
			requireFloatAt(t, 5, f2, 1)

			requireFloatAt(t, 2, f3, 0)
			requireFloatAt(t, 2, f3, 1)
		})
	})

	t.Run("Group by", func(t *testing.T) {
		t.Run("Simple group by 1 metric 2 frames", func(t *testing.T) {
			query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [{ "type": "count", "id": "1" }],
			"bucketAggs": [
			{ "type": "terms", "field": "host", "id": "2" },
			{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
			]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  {
					"3": {
					  "buckets": [
						{ "doc_count": 1, "key": 1000 },
						{ "doc_count": 3, "key": 2000 }
					  ]
					},
					"doc_count": 4,
					"key": "server1"
				  },
				  {
					"3": {
					  "buckets": [
						{ "doc_count": 2, "key": 1000 },
						{ "doc_count": 8, "key": 2000 }
					  ]
					},
					"doc_count": 10,
					"key": "server2"
				  }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 2)

			requireFrameLength(t, frames[0], 2)
			requireTimeSeriesName(t, "server1", frames[0])
			requireTimeSeriesName(t, "server2", frames[1])
		})

		t.Run("Single group with alias pattern 3 frames", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [{ "type": "count", "id": "1" }],
		  "alias": "{{term @host}} {{metric}} and {{not_exist}} {{@host}}",
		  "bucketAggs": [
			{ "type": "terms", "field": "@host", "id": "2" },
			{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
		  ]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  {
					"3": {
					  "buckets": [
						{ "doc_count": 1, "key": 1000 },
						{ "doc_count": 3, "key": 2000 }
					  ]
					},
					"doc_count": 4,
					"key": "server1"
				  },
				  {
					"3": {
					  "buckets": [
						{ "doc_count": 2, "key": 1000 },
						{ "doc_count": 8, "key": 2000 }
					  ]
					},
					"doc_count": 10,
					"key": "server2"
				  },
				  {
					"3": {
					  "buckets": [
						{ "doc_count": 2, "key": 1000 },
						{ "doc_count": 8, "key": 2000 }
					  ]
					},
					"doc_count": 10,
					"key": 0
				  }
				]
			  }
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

			requireFrameLength(t, frames[0], 2)
			requireTimeSeriesName(t, "server1 Count and {{not_exist}} server1", frames[0])
			requireTimeSeriesName(t, "server2 Count and {{not_exist}} server2", frames[1])
			requireTimeSeriesName(t, "0 Count and {{not_exist}} 0", frames[2])
		})

		t.Run("Single group by query one metric", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "count", "id": "1" }],
          "bucketAggs": [
						{ "type": "terms", "field": "host", "id": "2" },
						{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "3": {
                      "buckets": [{ "doc_count": 1, "key": 1000 }, { "doc_count": 3, "key": 2000 }]
                    },
                    "doc_count": 4,
                    "key": "server1"
                  },
                  {
                    "3": {
                      "buckets": [{ "doc_count": 2, "key": 1000 }, { "doc_count": 8, "key": 2000 }]
                    },
                    "doc_count": 10,
                    "key": "server2"
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 2)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server1")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server2")
		})

		t.Run("Single group by query two metrics", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "count", "id": "1" }, { "type": "avg", "field": "@value", "id": "4" }],
          "bucketAggs": [
						{ "type": "terms", "field": "host", "id": "2" },
						{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "3": {
                      "buckets": [
                        { "4": { "value": 10 }, "doc_count": 1, "key": 1000 },
                        { "4": { "value": 12 }, "doc_count": 3, "key": 2000 }
                      ]
                    },
                    "doc_count": 4,
                    "key": "server1"
                  },
                  {
                    "3": {
                      "buckets": [
                        { "4": { "value": 20 }, "doc_count": 1, "key": 1000 },
                        { "4": { "value": 32 }, "doc_count": 3, "key": 2000 }
                      ]
                    },
                    "doc_count": 10,
                    "key": "server2"
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 4)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server1 Count")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server1 Average @value")

			frame = dataframes[2]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server2 Count")

			frame = dataframes[3]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server2 Average @value")
		})

		t.Run("Simple group by 2 metrics 4 frames", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [
			{ "type": "count", "id": "1" },
			{ "type": "avg", "field": "@value", "id": "4" }
		  ],
		  "bucketAggs": [
			{ "type": "terms", "field": "host", "id": "2" },
			{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
		  ]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  {
					"3": {
					  "buckets": [
						{ "4": { "value": 10 }, "doc_count": 1, "key": 1000 },
						{ "4": { "value": 12 }, "doc_count": 3, "key": 2000 }
					  ]
					},
					"doc_count": 4,
					"key": "server1"
				  },
				  {
					"3": {
					  "buckets": [
						{ "4": { "value": 20 }, "doc_count": 1, "key": 1000 },
						{ "4": { "value": 32 }, "doc_count": 3, "key": 2000 }
					  ]
					},
					"doc_count": 10,
					"key": "server2"
				  }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 4)
			requireFrameLength(t, frames[0], 2)
			requireTimeSeriesName(t, "server1 Count", frames[0])
			requireTimeSeriesName(t, "server1 Average @value", frames[1])
			requireTimeSeriesName(t, "server2 Count", frames[2])
			requireTimeSeriesName(t, "server2 Average @value", frames[3])
		})

		t.Run("Single group by with alias pattern", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"alias": "{{term @host}} {{metric}} and {{not_exist}} {{@host}}",
					"metrics": [{ "type": "count", "id": "1" }],
          "bucketAggs": [
						{ "type": "terms", "field": "@host", "id": "2" },
						{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "3": {
                      "buckets": [{ "doc_count": 1, "key": 1000 }, { "doc_count": 3, "key": 2000 }]
                    },
                    "doc_count": 4,
                    "key": "server1"
                  },
                  {
                    "3": {
                      "buckets": [{ "doc_count": 2, "key": 1000 }, { "doc_count": 8, "key": 2000 }]
                    },
                    "doc_count": 10,
                    "key": "server2"
                  },
                  {
                    "3": {
                      "buckets": [{ "doc_count": 2, "key": 1000 }, { "doc_count": 8, "key": 2000 }]
                    },
                    "doc_count": 10,
                    "key": 0
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 3)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server1 Count and {{not_exist}} server1")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server2 Count and {{not_exist}} server2")

			frame = dataframes[2]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "0 Count and {{not_exist}} 0")
		})
	})

	t.Run("Extended stats", func(t *testing.T) {
		t.Run("Extended stats 4 frames", func(t *testing.T) {
			query := []byte(`
	[
		{
			"refId": "A",
			"metrics": [
			{
				"type": "extended_stats",
				"meta": { "max": true, "std_deviation_bounds_upper": true },
				"id": "1",
				"field": "@value"
			}
			],
			"bucketAggs": [
			{ "type": "terms", "field": "host", "id": "3" },
			{ "type": "date_histogram", "id": "4" }
			]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "3": {
				"buckets": [
				  {
					"4": {
					  "buckets": [
						{
						  "1": {
							"max": 10.2,
							"min": 5.5,
							"std_deviation_bounds": { "upper": 3, "lower": -2 }
						  },
						  "doc_count": 10,
						  "key": 1000
						}
					  ]
					},
					"key": "server1"
				  },
				  {
					"4": {
					  "buckets": [
						{
						  "1": {
							"max": 10.2,
							"min": 5.5,
							"std_deviation_bounds": { "upper": 3, "lower": -2 }
						  },
						  "doc_count": 10,
						  "key": 1000
						}
					  ]
					},
					"key": "server2"
				  }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 4)
			requireFrameLength(t, frames[0], 1)
			requireTimeSeriesName(t, "server1 Max @value", frames[0])
			requireTimeSeriesName(t, "server1 Std Dev Upper @value", frames[1])

			requireNumberValue(t, 10.2, frames[0], 0)
			requireNumberValue(t, 3, frames[1], 0)
		})

		t.Run("With extended stats", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "extended_stats", "meta": { "max": true, "std_deviation_bounds_upper": true, "std_deviation_bounds_lower": true }, "id": "1" }],
          "bucketAggs": [
						{ "type": "terms", "field": "host", "id": "3" },
						{ "type": "date_histogram", "field": "@timestamp", "id": "4" }
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "3": {
                "buckets": [
                  {
                    "key": "server1",
                    "4": {
                      "buckets": [
                        {
                          "1": {
                            "max": 10.2,
                            "min": 5.5,
                            "std_deviation_bounds": { "upper": 3, "lower": -2 }
                          },
                          "doc_count": 10,
                          "key": 1000
                        }
                      ]
                    }
                  },
                  {
                    "key": "server2",
                    "4": {
                      "buckets": [
                        {
                          "1": {
                            "max": 15.5,
                            "min": 3.4,
                            "std_deviation_bounds": { "upper": 4, "lower": -1 }
                          },
                          "doc_count": 10,
                          "key": 1000
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 6)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server1 Max")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server1 Std Dev Lower")

			frame = dataframes[2]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server1 Std Dev Upper")

			frame = dataframes[3]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server2 Max")

			frame = dataframes[4]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server2 Std Dev Lower")

			frame = dataframes[5]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "server2 Std Dev Upper")
		})
	})

	t.Run("Count", func(t *testing.T) {
		t.Run("Simple query returns 1 frame", func(t *testing.T) {
			query := []byte(`
		[
			{
				"refId": "A",
				"metrics": [{ "type": "count", "id": "1" }],
				"bucketAggs": [
				{ "type": "date_histogram", "field": "@timestamp", "id": "2" }
				]
			}
			]
		`)

			response := []byte(`
		{
			"responses": [
			  {
				"aggregations": {
				  "2": {
					"buckets": [
					  { "doc_count": 10, "key": 1000 },
					  { "doc_count": 15, "key": 2000 }
					]
				  }
				}
			  }
			]
		  }
		`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 1, "frame-count wrong")
			frame := frames[0]
			requireTimeSeriesName(t, "Count", frame)

			requireFrameLength(t, frame, 2)
			requireTimeValue(t, 1000, frame, 0)
			requireNumberValue(t, 10, frame, 0)
		})

		t.Run("Simple count with date_histogram aggregation", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "count", "id": "1" }],
          "bucketAggs": [{ "type": "date_histogram", "field": "@timestamp", "id": "2" }]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "doc_count": 10,
                    "key": 1000
                  },
                  {
                    "doc_count": 15,
                    "key": 2000
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.Len(t, dataframes, 1)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)

			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Count")
		})

		t.Run("Simple query count & avg aggregation", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "count", "id": "1" }, {"type": "avg", "field": "value", "id": "2" }],
          "bucketAggs": [{ "type": "date_histogram", "field": "@timestamp", "id": "3" }]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "3": {
                "buckets": [
                  {
                    "2": { "value": 88 },
                    "doc_count": 10,
                    "key": 1000
                  },
                  {
                    "2": { "value": 99 },
                    "doc_count": 15,
                    "key": 2000
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 2)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)

			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Count")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)

			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Average value")
		})
	})

	t.Run("Avg", func(t *testing.T) {
		t.Run("Query with duplicated avg metric creates unique field name", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{"type": "avg", "field": "value", "id": "1" }, {"type": "avg", "field": "value", "id": "4" }],
          "bucketAggs": [{ "type": "terms", "field": "label", "id": "3" }]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "3": {
                "buckets": [
                  {
                    "1": { "value": 88 },
										"4": { "value": 88 },
                    "doc_count": 10,
                    "key": "val1"
                  },
                  {
                    "1": { "value": 99 },
										"4": { "value": 99 },
                    "doc_count": 15,
                    "key": "val2"
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 1)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 3)
			require.Equal(t, frame.Fields[0].Name, "label")
			require.Equal(t, frame.Fields[1].Name, "Average value 1")
			require.Equal(t, frame.Fields[2].Name, "Average value 4")
		})
	})

	t.Run("Multiple bucket agg", func(t *testing.T) {
		t.Run("Date histogram with 2 filters agg", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [{ "type": "count", "id": "1" }],
		  "bucketAggs": [
			{
			  "id": "2",
			  "type": "filters",
			  "settings": {
				"filters": [
				  { "query": "@metric:cpu", "label": "" },
				  { "query": "@metric:logins.count", "label": "" }
				]
			  }
			},
			{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
		  ]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": {
				  "@metric:cpu": {
					"3": {
					  "buckets": [
						{ "doc_count": 1, "key": 1000 },
						{ "doc_count": 3, "key": 2000 }
					  ]
					}
				  },
				  "@metric:logins.count": {
					"3": {
					  "buckets": [
						{ "doc_count": 2, "key": 1000 },
						{ "doc_count": 8, "key": 2000 }
					  ]
					}
				  }
				}
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.Len(t, frames, 2)
			requireFrameLength(t, frames[0], 2)
			requireTimeSeriesName(t, "@metric:cpu", frames[0])
			requireTimeSeriesName(t, "@metric:logins.count", frames[1])
		})

		t.Run("With two filters agg", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "count", "id": "1" }],
          "bucketAggs": [
						{
							"type": "filters",
							"id": "2",
							"settings": {
								"filters": [{ "query": "@metric:cpu" }, { "query": "@metric:logins.count" }]
							}
						},
						{ "type": "date_histogram", "field": "@timestamp", "id": "3" }
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": {
                  "@metric:cpu": {
                    "3": {
                      "buckets": [{ "doc_count": 1, "key": 1000 }, { "doc_count": 3, "key": 2000 }]
                    }
                  },
                  "@metric:logins.count": {
                    "3": {
                      "buckets": [{ "doc_count": 2, "key": 1000 }, { "doc_count": 8, "key": 2000 }]
                    }
                  }
                }
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 2)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "@metric:cpu")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "@metric:logins.count")
		})
	})

	t.Run("With multiple metrics", func(t *testing.T) {
		t.Run("Multiple metrics with the same type", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [
			{ "type": "avg", "id": "1", "field": "test" },
			{ "type": "avg", "id": "2", "field": "test2" }
		  ],
		  "bucketAggs": [{ "id": "2", "type": "terms", "field": "host" }]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  {
					"1": { "value": 1000 },
					"2": { "value": 3000 },
					"key": "server-1",
					"doc_count": 369
				  }
				]
			  }
			}
		  }
		]
	  }
		  
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.True(t, len(frames) > 0)
			requireFrameLength(t, frames[0], 1)
			require.Len(t, frames[0].Fields, 3)

			requireStringAt(t, "server-1", frames[0].Fields[0], 0)
			requireFloatAt(t, 1000.0, frames[0].Fields[1], 0)
			requireFloatAt(t, 3000.0, frames[0].Fields[2], 0)
		})

		t.Run("Multiple metrics of same type", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "avg", "field": "test", "id": "1" }, { "type": "avg", "field": "test2", "id": "2" }],
          "bucketAggs": [{ "type": "terms", "field": "host", "id": "2" }]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "1": { "value": 1000 },
                    "2": { "value": 3000 },
                    "key": "server-1",
                    "doc_count": 369
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 1)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 3)
			require.Equal(t, frame.Fields[0].Name, "host")
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, "Average test")
			require.Equal(t, frame.Fields[1].Len(), 1)
			require.Equal(t, frame.Fields[2].Name, "Average test2")
			require.Equal(t, frame.Fields[2].Len(), 1)
			require.Nil(t, frame.Fields[1].Config)
		})

		t.Run("No group by time", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "avg", "id": "1" }, { "type": "count" }],
         "bucketAggs": [{ "type": "terms", "field": "host", "id": "2" }]
				}`,
			}
			response := `{
        "responses": [
         {
           "aggregations": {
             "2": {
               "buckets": [
                 {
                   "1": { "value": 1000 },
                   "key": "server-1",
                   "doc_count": 369
                 },
                 {
                   "1": { "value": 2000 },
                   "key": "server-2",
                   "doc_count": 200
                 }
               ]
             }
           }
         }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 1)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 3)
			require.Equal(t, frame.Fields[0].Name, "host")
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, "Average")
			require.Equal(t, frame.Fields[1].Len(), 2)
			require.Equal(t, frame.Fields[2].Name, "Count")
			require.Equal(t, frame.Fields[2].Len(), 2)
			require.Nil(t, frame.Fields[1].Config)
		})

		t.Run("With drop first and last aggregation (numeric)", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "avg", "id": "1" }, { "type": "count" }],
          "bucketAggs": [
						{
							"type": "date_histogram",
							"field": "@timestamp",
							"id": "2",
							"settings": { "trimEdges": 1 }
						}
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "1": { "value": 1000 },
                    "key": 1,
                    "doc_count": 369
                  },
                  {
                    "1": { "value": 2000 },
                    "key": 2,
                    "doc_count": 200
                  },
                  {
                    "1": { "value": 2000 },
                    "key": 3,
                    "doc_count": 200
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 2)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Average")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Count")
		})

		t.Run("With drop first and last aggregation (string)", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "avg", "id": "1" }, { "type": "count" }],
          "bucketAggs": [
						{
							"type": "date_histogram",
							"field": "@timestamp",
							"id": "2",
							"settings": { "trimEdges": "1" }
						}
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "1": { "value": 1000 },
                    "key": 1,
                    "doc_count": 369
                  },
                  {
                    "1": { "value": 2000 },
                    "key": 2,
                    "doc_count": 200
                  },
                  {
                    "1": { "value": 2000 },
                    "key": 3,
                    "doc_count": 200
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 2)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Average")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 1)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 1)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Count")
		})
	})

	t.Run("Trim edges", func(t *testing.T) {
		t.Run("Larger trimEdges value", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [{ "type": "count" }],
          "bucketAggs": [
						{
							"type": "date_histogram",
							"field": "@timestamp",
							"id": "2",
							"settings": { "trimEdges": "3" }
						}
					]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  { "key": 1000, "doc_count": 10},
                  { "key": 2000, "doc_count": 20},
                  { "key": 3000, "doc_count": 30},
                  { "key": 4000, "doc_count": 40},
                  { "key": 5000, "doc_count": 50},
                  { "key": 6000, "doc_count": 60},
                  { "key": 7000, "doc_count": 70},
                  { "key": 8000, "doc_count": 80},
                  { "key": 9000, "doc_count": 90}
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)

			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			experimental.CheckGoldenJSONResponse(t, "testdata", "trimedges_string.golden", &queryRes, *update)
		})
	})

	t.Run("Bucket script", func(t *testing.T) {
		t.Run("With bucket_script", func(t *testing.T) {
			targets := map[string]string{
				"A": `{
					"metrics": [
						{ "id": "1", "type": "sum", "field": "@value" },
            { "id": "3", "type": "max", "field": "@value" },
            {
              "id": "4",
              "pipelineVariables": [{ "name": "var1", "pipelineAgg": "1" }, { "name": "var2", "pipelineAgg": "3" }],
              "settings": { "script": "params.var1 * params.var2" },
              "type": "bucket_script"
            }
					],
          "bucketAggs": [{ "type": "date_histogram", "field": "@timestamp", "id": "2" }]
				}`,
			}
			response := `{
        "responses": [
          {
            "aggregations": {
              "2": {
                "buckets": [
                  {
                    "1": { "value": 2 },
                    "3": { "value": 3 },
                    "4": { "value": 6 },
                    "doc_count": 60,
                    "key": 1000
                  },
                  {
                    "1": { "value": 3 },
                    "3": { "value": 4 },
                    "4": { "value": 12 },
                    "doc_count": 60,
                    "key": 2000
                  }
                ]
              }
            }
          }
        ]
			}`
			result, err := parseTestResponse(targets, response)
			require.NoError(t, err)
			require.Len(t, result.Responses, 1)

			queryRes := result.Responses["A"]
			require.NotNil(t, queryRes)
			dataframes := queryRes.Frames
			require.NoError(t, err)
			require.Len(t, dataframes, 3)

			frame := dataframes[0]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Sum @value")

			frame = dataframes[1]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Max @value")

			frame = dataframes[2]
			require.Len(t, frame.Fields, 2)
			require.Equal(t, frame.Fields[0].Name, data.TimeSeriesTimeFieldName)
			require.Equal(t, frame.Fields[0].Len(), 2)
			require.Equal(t, frame.Fields[1].Name, data.TimeSeriesValueFieldName)
			require.Equal(t, frame.Fields[1].Len(), 2)
			assert.Equal(t, frame.Fields[1].Config.DisplayNameFromDS, "Sum @value * Max @value")
		})

		t.Run("Two bucket_script", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [
			{ "id": "1", "type": "sum", "field": "@value" },
			{ "id": "3", "type": "max", "field": "@value" },
			{
			  "id": "4",
			  "pipelineVariables": [
				{ "name": "var1", "pipelineAgg": "1" },
				{ "name": "var2", "pipelineAgg": "3" }
			  ],
			  "settings": { "script": "params.var1 * params.var2" },
			  "type": "bucket_script"
			},
			{
			  "id": "5",
			  "pipelineVariables": [
				{ "name": "var1", "pipelineAgg": "1" },
				{ "name": "var2", "pipelineAgg": "3" }
			  ],
			  "settings": { "script": "params.var1 * params.var2 * 4" },
			  "type": "bucket_script"
			}
		  ],
		  "bucketAggs": [{ "type": "terms", "field": "@timestamp", "id": "2" }]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  {
					"1": { "value": 2 },
					"3": { "value": 3 },
					"4": { "value": 6 },
					"5": { "value": 24 },
					"doc_count": 60,
					"key": 1000
				  },
				  {
					"1": { "value": 3 },
					"3": { "value": 4 },
					"4": { "value": 12 },
					"5": { "value": 48 },
					"doc_count": 60,
					"key": 2000
				  }
				]
			  }
			}
		  }
		]
	}
	`)

			result, err := queryDataTest(query, response)
			require.NoError(t, err)

			require.Len(t, result.response.Responses, 1)
			frames := result.response.Responses["A"].Frames
			require.True(t, len(frames) > 0)
			requireFrameLength(t, frames[0], 2)

			fields := frames[0].Fields
			require.Len(t, fields, 5)

			requireFloatAt(t, 1000.0, fields[0], 0)
			requireFloatAt(t, 2000.0, fields[0], 1)
			requireFloatAt(t, 2.0, fields[1], 0)
			requireFloatAt(t, 3.0, fields[1], 1)
			requireFloatAt(t, 3.0, fields[2], 0)
			requireFloatAt(t, 4.0, fields[2], 1)
			requireFloatAt(t, 6.0, fields[3], 0)
			requireFloatAt(t, 12.0, fields[3], 1)
			requireFloatAt(t, 24.0, fields[4], 0)
			requireFloatAt(t, 48.0, fields[4], 1)
		})

		t.Run("Bucket script", func(t *testing.T) {
			query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [
			{ "id": "1", "type": "sum", "field": "@value" },
			{ "id": "3", "type": "max", "field": "@value" },
			{
			  "id": "4",
			  "pipelineVariables": [
				{ "name": "var1", "pipelineAgg": "1" },
				{ "name": "var2", "pipelineAgg": "3" }
			  ],
			  "settings": { "script": "params.var1 * params.var2" },
			  "type": "bucket_script"
			}
		  ],
		  "bucketAggs": [
			{ "type": "date_histogram", "field": "@timestamp", "id": "2" }
		  ]
		}
	]
	`)

			response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  {
					"1": { "value": 2 },
					"3": { "value": 3 },
					"4": { "value": 6 },
					"doc_count": 60,
					"key": 1000
				  },
				  {
					"1": { "value": 3 },
					"3": { "value": 4 },
					"4": { "value": 12 },
					"doc_count": 60,
					"key": 2000
				  }
				]
			  }
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
			requireFrameLength(t, frames[0], 2)
			requireTimeSeriesName(t, "Sum @value", frames[0])
			requireTimeSeriesName(t, "Max @value", frames[1])
			requireTimeSeriesName(t, "Sum @value * Max @value", frames[2])

			requireNumberValue(t, 2, frames[0], 0)
			requireNumberValue(t, 3, frames[1], 0)
			requireNumberValue(t, 6, frames[2], 0)

			requireNumberValue(t, 3, frames[0], 1)
			requireNumberValue(t, 4, frames[1], 1)
			requireNumberValue(t, 12, frames[2], 1)
		})
	})
}

func TestParseResponse(t *testing.T) {
	t.Run("Correctly matches refId to response", func(t *testing.T) {
		require.NoError(t, nil)
		query := []byte(`
			[
				{
					"refId": "COUNT_GROUPBY_DATE_HISTOGRAM",
					"metrics": [{ "type": "count", "id": "c_1" }],
					"bucketAggs": [{ "type": "date_histogram", "field": "@timestamp", "id": "c_2" }]
				},
				{
					"refId": "COUNT_GROUPBY_HISTOGRAM",
					"metrics": [{ "type": "count", "id": "h_3" }],
					"bucketAggs": [{ "type": "histogram", "field": "bytes", "id": "h_4" }]
				},
				{
					"refId": "RAW_DOC",
					"metrics": [{ "type": "raw_document", "id": "r_5" }],
					"bucketAggs": []
				},
				{
					"refId": "PERCENTILE",
					"metrics": [
					{
						"type": "percentiles",
						"settings": { "percents": ["75", "90"] },
						"id": "p_1"
					}
					],
					"bucketAggs": [{ "type": "date_histogram", "field": "@timestamp", "id": "p_3" }]
				},
				{
					"refId": "EXTENDEDSTATS",
					"metrics": [
					{
						"type": "extended_stats",
						"meta": { "max": true, "std_deviation_bounds_upper": true },
						"id": "e_1"
					}
					],
					"bucketAggs": [
					{ "type": "terms", "field": "host", "id": "e_3" },
					{ "type": "date_histogram", "id": "e_4" }
					]
				},
				{
					"refId": "RAWDATA",
					"metrics": [{ "type": "raw_data", "id": "6" }],
					"bucketAggs": []
				}
			]
			`)

		response := []byte(`
			{
				"responses": [
				  {
					"aggregations": {
					  "c_2": {
						"buckets": [{"doc_count": 10, "key": 1000}]
					  }
					}
				  },
				  {
					"aggregations": {
					  "h_4": {
						"buckets": [{ "doc_count": 1, "key": 1000 }]
					  }
					}
				  },
				  {
					"hits": {
					  "total": 2,
					  "hits": [
						{
						  "_id": "5",
						  "_type": "type",
						  "_index": "index",
						  "_source": { "sourceProp": "asd" },
						  "fields": { "fieldProp": "field" }
						},
						{
						  "_source": { "sourceProp": "asd2" },
						  "fields": { "fieldProp": "field2" }
						}
					  ]
					}
				  },
				  {
					"aggregations": {
					  "p_3": {
						"buckets": [
						  {
							"p_1": { "values": { "75": 3.3, "90": 5.5 } },
							"doc_count": 10,
							"key": 1000
						  },
						  {
							"p_1": { "values": { "75": 2.3, "90": 4.5 } },
							"doc_count": 15,
							"key": 2000
						  }
						]
					  }
					}
				  },
				  {
					"aggregations": {
					  "e_3": {
						"buckets": [
						  {
							"key": "server1",
							"e_4": {
							  "buckets": [
								{
								  "e_1": {
									"max": 10.2,
									"min": 5.5,
									"std_deviation_bounds": { "upper": 3, "lower": -2 }
								  },
								  "doc_count": 10,
								  "key": 1000
								}
							  ]
							}
						  },
						  {
							"key": "server2",
							"e_4": {
							  "buckets": [
								{
								  "e_1": {
									"max": 10.2,
									"min": 5.5,
									"std_deviation_bounds": { "upper": 3, "lower": -2 }
								  },
								  "doc_count": 10,
								  "key": 1000
								}
							  ]
							}
						  }
						]
					  }
					}
				  },
				  {
					"hits": {
					  "total": {
						"relation": "eq",
						"value": 1
					  },
					  "hits": [
						{
						  "_id": "6",
						  "_type": "_doc",
						  "_index": "index",
						  "_source": { "sourceProp": "asd" }
						}
					  ]
					}
				  }
				]
			  }
			`)

		result, err := queryDataTest(query, response)
		require.NoError(t, err)

		verifyFrames := func(name string, expectedLength int) {
			r, found := result.response.Responses[name]
			require.True(t, found, "not found: "+name)
			require.NoError(t, r.Error)
			require.Len(t, r.Frames, expectedLength, "length wrong for "+name)
		}

		verifyFrames("COUNT_GROUPBY_DATE_HISTOGRAM", 1)
		verifyFrames("COUNT_GROUPBY_HISTOGRAM", 1)
		verifyFrames("RAW_DOC", 1)
		verifyFrames("PERCENTILE", 2)
		verifyFrames("EXTENDEDSTATS", 4)
		verifyFrames("RAWDATA", 1)
	})
}

func TestLabelOrderInFieldName(t *testing.T) {
	query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [{ "type": "count", "id": "1" }],
		  "bucketAggs": [
			{ "type": "terms", "field": "f1", "id": "3" },
			{ "type": "terms", "field": "f2", "id": "4" },
			{ "type": "date_histogram", "field": "@timestamp", "id": "2" }
		  ]
		}
	  ]
	`)

	response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "3": {
				"buckets": [
				  {
					"key": "val3",
					"4": {
					  "buckets": [
						{
						  "key": "info",
						  "2": {"buckets": [{ "key_as_string": "1675086600000", "key": 1675086600000, "doc_count": 5 }]}
						},
						{
						  "key": "error",
						  "2": {"buckets": [{ "key_as_string": "1675086600000", "key": 1675086600000, "doc_count": 2 }]}
						}
					  ]
					}
				  },
				  {
					"key": "val2",
					"4": {
					  "buckets": [
						{
						  "key": "info",
						  "2": {"buckets": [{ "key_as_string": "1675086600000", "key": 1675086600000, "doc_count": 6 }]}
						},
						{
						  "key": "error",
						  "2": {"buckets": [{ "key_as_string": "1675086600000", "key": 1675086600000, "doc_count": 1 }]}
						}
					  ]
					}
				  },
				  {
					"key": "val1",
					"4": {
					  "buckets": [
						{
						  "key": "info",
						  "2": {"buckets": [{ "key_as_string": "1675086600000", "key": 1675086600000, "doc_count": 6 }]}
						},
						{
						  "key": "error",
						  "2": {"buckets": [{ "key_as_string": "1675086600000", "key": 1675086600000, "doc_count": 2 }]}
						}
					  ]
					}
				  }
				]
			  }
			}
		  }
		]
	  }
	`)

	result, err := queryDataTest(query, response)
	require.NoError(t, err)

	require.Len(t, result.response.Responses, 1)
	frames := result.response.Responses["A"].Frames
	require.Len(t, frames, 6)

	// the important part is that the label-value is always before the level-value
	requireTimeSeriesName(t, "val3 info", frames[0])
	requireTimeSeriesName(t, "val3 error", frames[1])
	requireTimeSeriesName(t, "val2 info", frames[2])
	requireTimeSeriesName(t, "val2 error", frames[3])
	requireTimeSeriesName(t, "val1 info", frames[4])
	requireTimeSeriesName(t, "val1 error", frames[5])
}

func TestParseLuceneQuery(t *testing.T) {
	t.Run("Empty term query", func(t *testing.T) {
		query := ""
		highlights := parseLuceneQuery(query)
		require.Len(t, highlights, 0)
	})

	t.Run("Simple term query", func(t *testing.T) {
		query := "foo"
		highlights := parseLuceneQuery(query)
		require.Len(t, highlights, 1)
		require.Equal(t, "foo", highlights[0])
	})

	t.Run("Multi term query", func(t *testing.T) {
		query := "foo bar"
		highlights := parseLuceneQuery(query)
		require.Len(t, highlights, 2)
		require.Equal(t, "foo", highlights[0])
		require.Equal(t, "bar", highlights[1])
	})

	t.Run("Wildcard query", func(t *testing.T) {
		query := "foo*"
		highlights := parseLuceneQuery(query)
		require.Len(t, highlights, 1)
		require.Equal(t, "foo", highlights[0])
	})

	t.Run("KeyValue query", func(t *testing.T) {
		query := "foo:bar*"
		highlights := parseLuceneQuery(query)
		require.Len(t, highlights, 1)
		require.Equal(t, "bar", highlights[0])
	})

	t.Run("MultiKeyValue query", func(t *testing.T) {
		query := "foo:bar* AND foo2:bar2"
		highlights := parseLuceneQuery(query)
		require.Len(t, highlights, 2)
		require.Equal(t, "bar", highlights[0])
		require.Equal(t, "bar2", highlights[1])
	})
}

func TestFlatten(t *testing.T) {
	t.Run("Flattens simple object", func(t *testing.T) {
		obj := map[string]interface{}{
			"foo": "bar",
			"nested": map[string]interface{}{
				"bax": map[string]interface{}{
					"baz": "qux",
				},
			},
		}

		flattened := flatten(obj)
		require.Len(t, flattened, 2)
		require.Equal(t, "bar", flattened["foo"])
		require.Equal(t, "qux", flattened["nested.bax.baz"])
	})

	t.Run("Flattens object to max 10 nested levels", func(t *testing.T) {
		obj := map[string]interface{}{
			"nested0": map[string]interface{}{
				"nested1": map[string]interface{}{
					"nested2": map[string]interface{}{
						"nested3": map[string]interface{}{
							"nested4": map[string]interface{}{
								"nested5": map[string]interface{}{
									"nested6": map[string]interface{}{
										"nested7": map[string]interface{}{
											"nested8": map[string]interface{}{
												"nested9": map[string]interface{}{
													"nested10": map[string]interface{}{
														"nested11": map[string]interface{}{
															"nested12": "abc",
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		}

		flattened := flatten(obj)
		require.Len(t, flattened, 1)
		require.Equal(t, map[string]interface{}{"nested11": map[string]interface{}{"nested12": "abc"}}, flattened["nested0.nested1.nested2.nested3.nested4.nested5.nested6.nested7.nested8.nested9.nested10"])
	})
}

func TestTrimEdges(t *testing.T) {
	query := []byte(`
	[
		{
		  "refId": "A",
		  "metrics": [
			{ "type": "avg", "id": "1", "field": "@value" },
			{ "type": "count", "id": "3" }
		  ],
		  "bucketAggs": [
			{
			  "id": "2",
			  "type": "date_histogram",
			  "field": "host",
			  "settings": { "trimEdges": "1" }
			}
		  ]
		}
	]
	`)

	response := []byte(`
	{
		"responses": [
		  {
			"aggregations": {
			  "2": {
				"buckets": [
				  { "1": { "value": 1000 }, "key": 1, "doc_count": 369 },
				  { "1": { "value": 2000 }, "key": 2, "doc_count": 200 },
				  { "1": { "value": 2000 }, "key": 3, "doc_count": 200 }
				]
			  }
			}
		  }
		]
	}
	`)

	result, err := queryDataTest(query, response)
	require.NoError(t, err)

	require.Len(t, result.response.Responses, 1)
	frames := result.response.Responses["A"].Frames
	require.Len(t, frames, 2)

	// should remove first and last value
	requireFrameLength(t, frames[0], 1)
}

func parseTestResponse(tsdbQueries map[string]string, responseBody string) (*backend.QueryDataResponse, error) {
	from := time.Date(2018, 5, 15, 17, 50, 0, 0, time.UTC)
	to := time.Date(2018, 5, 15, 17, 55, 0, 0, time.UTC)
	configuredFields := es.ConfiguredFields{
		TimeOutputFormat: Rfc3339,
		TimeField:        "@timestamp",
		LogMessageField:  "line",
		LogLevelField:    "lvl",
	}
	timeRange := backend.TimeRange{
		From: from,
		To:   to,
	}
	tsdbQuery := backend.QueryDataRequest{
		Queries: []backend.DataQuery{},
	}

	for refID, tsdbQueryBody := range tsdbQueries {
		tsdbQuery.Queries = append(tsdbQuery.Queries, backend.DataQuery{
			TimeRange: timeRange,
			RefID:     refID,
			JSON:      json.RawMessage(tsdbQueryBody),
		})
	}

	var response es.MultiSearchResponse
	err := json.Unmarshal([]byte(responseBody), &response)
	if err != nil {
		return nil, err
	}

	queries, err := parseQuery(tsdbQuery.Queries)
	if err != nil {
		return nil, err
	}

	return parseResponse(response.Responses, queries, configuredFields)
}

func requireTimeValue(t *testing.T, expected int64, frame *data.Frame, index int) {
	getField := func() *data.Field {
		for _, field := range frame.Fields {
			if field.Type() == data.FieldTypeTime {
				return field
			}
		}
		return nil
	}

	field := getField()
	require.NotNil(t, field, "missing time-field")

	require.Equal(t, time.UnixMilli(expected).UTC(), field.At(index), fmt.Sprintf("wrong time at index %v", index))
}

func requireNumberValue(t *testing.T, expected float64, frame *data.Frame, index int) {
	getField := func() *data.Field {
		for _, field := range frame.Fields {
			if field.Type() == data.FieldTypeNullableFloat64 {
				return field
			}
		}
		return nil
	}

	field := getField()
	require.NotNil(t, field, "missing number-field")

	v := field.At(index).(*float64)

	require.Equal(t, expected, *v, fmt.Sprintf("wrong number at index %v", index))
}

func requireFrameLength(t *testing.T, frame *data.Frame, expectedLength int) {
	l, err := frame.RowLen()
	require.NoError(t, err)
	require.Equal(t, expectedLength, l, "wrong frame-length")
}

func requireStringAt(t *testing.T, expected string, field *data.Field, index int) {
	v := field.At(index).(*string)
	require.Equal(t, expected, *v, fmt.Sprintf("wrong string at index %v", index))
}

func requireFloatAt(t *testing.T, expected float64, field *data.Field, index int) {
	v := field.At(index).(*float64)
	require.Equal(t, expected, *v, fmt.Sprintf("wrong flaot at index %v", index))
}

func requireTimeSeriesName(t *testing.T, expected string, frame *data.Frame) {
	getField := func() *data.Field {
		for _, field := range frame.Fields {
			if field.Type() != data.FieldTypeTime {
				return field
			}
		}
		return nil
	}

	field := getField()
	require.NotNil(t, expected, field.Config)
	require.Equal(t, expected, field.Config.DisplayNameFromDS)
}
