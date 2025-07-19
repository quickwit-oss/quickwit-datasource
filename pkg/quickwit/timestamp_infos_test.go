package quickwit

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecodeTimestampFieldInfos(t *testing.T) {
	t.Run("Test decode simple fields", func(t *testing.T) {
		// Given
		query := []byte(`
			[{
				"version": "0.6",
				"index_config": {
				"version": "0.6",
				"doc_mapping": {
					"timestamp_field": "timestamp",
					"mode": "dynamic",
					"tokenizers": [],
					"field_mappings": [
						{
							"name": "foo",
							"type": "text",
							"fast": false,
							"fieldnorms": false,
							"indexed": true,
							"record": "basic",
							"stored": true,
							"tokenizer": "default"
						},
						{
							"name": "timestamp",
							"type": "datetime",
							"fast": true,
							"fast_precision": "seconds",
							"indexed": true,
							"input_formats": [
							"rfc3339",
							"unix_timestamp"
							],
							"output_format": "rfc3339",
							"stored": true
						}
					]
				},
				"retention": null
				},
				"sources": []
			}]
		`)

		// When
		var payload []QuickwitIndexMetadata
		err := json.Unmarshal(query, &payload)
		timestampFieldName, timestampOutputFormat, err := GetTimestampFieldInfos(payload)

		// Then
		require.NoError(t, err)
		require.Equal(t, timestampFieldName, "timestamp")
		require.Equal(t, timestampOutputFormat, "rfc3339")
	})

	t.Run("Test decode from list of index config", func(t *testing.T) {
		// Given
		query := []byte(`
		[
			{
				"version": "0.6",
				"index_config": {
				"doc_mapping": {
					"timestamp_field": "timestamp",
					"field_mappings": [
						{
							"name": "timestamp",
							"type": "datetime",
							"output_format": "rfc3339"
						}
					]
				},
				"indexing_settings": {},
				"retention": null
				},
				"sources": []
			}
		]
		`)

		// When
		var payload []QuickwitIndexMetadata
		err := json.Unmarshal(query, &payload)
		require.NoError(t, err)
		qwlog.Debug(fmt.Sprint(payload))
		timestampFieldName, _, err := GetTimestampFieldInfos(payload)
		// timestampFieldName, _, err := DecodeTimestampFieldFromIndexConfigs(query)

		// Then
		require.NoError(t, err)
		require.Equal(t, timestampFieldName, "timestamp")
	})

	t.Run("Test decode from list of index config with different timestamp fields return an error", func(t *testing.T) {
		// Given
		query := []byte(`
		[
			{
				"version": "0.6",
				"index_config": {
				"doc_mapping": {
					"timestamp_field": "timestamp",
					"field_mappings": [
						{
							"name": "timestamp",
							"type": "datetime",
							"output_format": "rfc3339"
						}
					]
				},
				"indexing_settings": {},
				"retention": null
				},
				"sources": []
			},
			{
				"version": "0.6",
				"index_config": {
					"doc_mapping": {
					"timestamp_field": "timestamp2",
					"field_mappings": [
						{
							"name": "timestamp2",
							"type": "datetime",
							"output_format": "rfc3339"
						}
					]
					},
					"indexing_settings": {},
					"retention": null
				},
				"sources": []
			}
		]
		`)

		// When
		// _, _, err := DecodeTimestampFieldFromIndexConfigs(query)
		var payload []QuickwitIndexMetadata
		err := json.Unmarshal(query, &payload)
		require.NoError(t, err)
		_, _, err = GetTimestampFieldInfos(payload)

		// Then
		require.Error(t, err)
		require.ErrorContains(t, err, "Indexes matching pattern have incompatible timestamp fields")
	})
}

func TestNewErrorCreationPayload(t *testing.T) {
	t.Run("Test marshall creation payload error", func(t *testing.T) {
		// When
		err := NewErrorCreationPayload(400, "No valid format")

		// Then
		require.Error(t, err)
		require.ErrorContains(t, err, "\"message\":\"No valid format\"")
		require.ErrorContains(t, err, "\"status\":400")
	})
}

func TestDecodeTimestampFieldInfosWithIssue152DocMapping(t *testing.T) {
	// This is the exact doc mapping from GitHub issue #152
	docMappingJSON := `{
		"doc_mapping_uid": "01JYK2J58VAC6HJX2H90K9F7R6",
		"mode": "dynamic",
		"dynamic_mapping": {
			"indexed": true,
			"tokenizer": "raw",
			"record": "basic",
			"stored": true,
			"expand_dots": true,
			"fast": {
				"normalizer": "raw"
			}
		},
		"field_mappings": [
			{
				"name": "actor",
				"type": "object",
				"field_mappings": [
					{
						"description": "Actor Type (Employee, User, System)",
						"fast": {
							"normalizer": "raw"
						},
						"fieldnorms": false,
						"indexed": true,
						"name": "type",
						"record": "basic",
						"stored": true,
						"tokenizer": "raw",
						"type": "text"
					},
					{
						"description": "Actor Metadata",
						"expand_dots": true,
						"fast": false,
						"indexed": true,
						"name": "metadata",
						"record": "basic",
						"stored": true,
						"tokenizer": "default",
						"type": "json"
					}
				]
			},
			{
				"name": "event",
				"type": "object",
				"field_mappings": [
					{
						"description": "Event Type (Normal, Authorization, Privacy, Location)",
						"fast": {
							"normalizer": "raw"
						},
						"fieldnorms": false,
						"indexed": true,
						"name": "type",
						"record": "basic",
						"stored": true,
						"tokenizer": "raw",
						"type": "text"
					},
					{
						"description": "Event Operation",
						"fast": {
							"normalizer": "raw"
						},
						"fieldnorms": false,
						"indexed": true,
						"name": "operation",
						"record": "basic",
						"stored": true,
						"tokenizer": "default",
						"type": "text"
					},
					{
						"description": "Event Reason",
						"fast": false,
						"fieldnorms": false,
						"indexed": true,
						"name": "reason",
						"record": "basic",
						"stored": true,
						"tokenizer": "default",
						"type": "text"
					},
					{
						"field_mappings": [
							{
								"description": "Event Resource Type",
								"fast": {
									"normalizer": "raw"
								},
								"fieldnorms": false,
								"indexed": true,
								"name": "type",
								"record": "basic",
								"stored": true,
								"tokenizer": "raw",
								"type": "text"
							},
							{
								"description": "Event Resource Value",
								"fast": {
									"normalizer": "raw"
								},
								"fieldnorms": false,
								"indexed": true,
								"name": "value",
								"record": "basic",
								"stored": true,
								"tokenizer": "default",
								"type": "text"
							}
						],
						"name": "resource",
						"type": "object"
					},
					{
						"description": "Event Metadata",
						"expand_dots": true,
						"fast": false,
						"indexed": true,
						"name": "metadata",
						"record": "basic",
						"stored": true,
						"tokenizer": "default",
						"type": "json"
					}
				]
			},
			{
				"name": "source",
				"type": "object",
				"field_mappings": [
					{
						"description": "Source Type (Admin, Service)",
						"fast": {
							"normalizer": "raw"
						},
						"fieldnorms": false,
						"indexed": true,
						"name": "type",
						"record": "basic",
						"stored": true,
						"tokenizer": "raw",
						"type": "text"
					},
					{
						"field_mappings": [
							{
								"description": "Source Name",
								"fast": {
									"normalizer": "raw"
								},
								"fieldnorms": false,
								"indexed": true,
								"name": "name",
								"record": "basic",
								"stored": true,
								"tokenizer": "default",
								"type": "text"
							},
							{
								"description": "Source Country Code",
								"fast": {
									"normalizer": "raw"
								},
								"fieldnorms": false,
								"indexed": true,
								"name": "country_code",
								"record": "basic",
								"stored": true,
								"tokenizer": "raw",
								"type": "text"
							},
							{
								"description": "Source URL",
								"fast": false,
								"fieldnorms": false,
								"indexed": true,
								"name": "url",
								"record": "basic",
								"stored": true,
								"tokenizer": "default",
								"type": "text"
							},
							{
								"description": "Source Request ID",
								"fast": {
									"normalizer": "raw"
								},
								"fieldnorms": false,
								"indexed": true,
								"name": "request_id",
								"record": "basic",
								"stored": true,
								"tokenizer": "raw",
								"type": "text"
							}
						],
						"name": "metadata",
						"type": "object"
					}
				]
			},
			{
				"name": "timestamp",
				"type": "datetime",
				"description": "Log occurrence timestamp",
				"fast": true,
				"fast_precision": "seconds",
				"indexed": true,
				"input_formats": [
					"iso8601",
					"unix_timestamp"
				],
				"output_format": "unix_timestamp_nanos",
				"stored": true
			},
			{
				"name": "env",
				"type": "text",
				"description": "Environment (alpha, prod)",
				"fast": {
					"normalizer": "raw"
				},
				"fieldnorms": false,
				"indexed": true,
				"record": "basic",
				"stored": true,
				"tokenizer": "raw"
			},
			{
				"name": "region",
				"type": "text",
				"description": "Region (kr, ca, jp, gb)",
				"fast": {
					"normalizer": "raw"
				},
				"fieldnorms": false,
				"indexed": true,
				"record": "basic",
				"stored": true,
				"tokenizer": "raw"
			}
		],
		"timestamp_field": "timestamp",
		"tag_fields": [],
		"max_num_partitions": 200,
		"index_field_presence": false,
		"store_document_size": false,
		"store_source": false,
		"tokenizers": []
	}`

	// Create the index metadata structure as it would be parsed from the API
	indexMetadata := QuickwitIndexMetadata{
		IndexConfig: struct {
			IndexID    string `json:"index_id"`
			DocMapping struct {
				TimestampField string          `json:"timestamp_field"`
				FieldMappings  []FieldMappings `json:"field_mappings"`
			} `json:"doc_mapping"`
		}{
			IndexID: "test-index",
		},
	}

	// Parse just the doc_mapping part
	var docMapping struct {
		TimestampField string          `json:"timestamp_field"`
		FieldMappings  []FieldMappings `json:"field_mappings"`
	}

	err := json.Unmarshal([]byte(docMappingJSON), &docMapping)
	require.NoError(t, err)

	indexMetadata.IndexConfig.DocMapping = docMapping

	// Debug: Print the parsed field mappings
	t.Logf("Timestamp field from doc mapping: %s", docMapping.TimestampField)
	t.Logf("Number of field mappings: %d", len(docMapping.FieldMappings))

	for i, field := range docMapping.FieldMappings {
		t.Logf("Field %d: name=%s, type=%s, output_format=%v", i, field.Name, field.Type, field.OutputFormat)
		if field.Name == "timestamp" {
			t.Logf("Found timestamp field: name=%s, type=%s, output_format=%v", field.Name, field.Type, field.OutputFormat)
		}
	}

	// Test the timestamp field detection
	timestampField, outputFormat := FindTimestampFieldInfos(indexMetadata)

	t.Logf("FindTimestampFieldInfos returned: field=%s, format=%s", timestampField, outputFormat)

	// Verify that it correctly identifies the timestamp field and format
	assert.Equal(t, "timestamp", timestampField, "Should correctly identify the timestamp field")
	assert.Equal(t, "unix_timestamp_nanos", outputFormat, "Should correctly identify the output format")

	// Test the higher-level function too
	timestampFieldName, timestampOutputFormat, err := GetTimestampFieldInfos([]QuickwitIndexMetadata{indexMetadata})
	if err != nil {
		t.Logf("GetTimestampFieldInfos error: %v", err)
	} else {
		require.NoError(t, err)
		assert.Equal(t, "timestamp", timestampFieldName)
		assert.Equal(t, "unix_timestamp_nanos", timestampOutputFormat)
	}
}
