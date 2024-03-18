package quickwit

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDecodeTimestampFieldInfos(t *testing.T) {
	t.Run("Test decode timestamp field infos", func(t *testing.T) {
		t.Run("Test decode simple fields", func(t *testing.T) {
			// Given
			query := []byte(`
				{
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
				}
			`)

			// When
			timestampFieldName, timestampOutputFormat, err := DecodeTimestampFieldFromIndexConfig(query)

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
						"timestamp_field": "sub.timestamp"
					},
					"indexing_settings": {},
					"retention": null
					},
					"sources": []
				}
			]
			`)

			// When
			timestampFieldName, _, err := DecodeTimestampFieldFromIndexConfigs(query)

			// Then
			require.NoError(t, err)
			require.Equal(t, timestampFieldName, "sub.timestamp")
		})

		t.Run("Test decode from list of index config with different timestamp fields return an error", func(t *testing.T) {
			// Given
			query := []byte(`
			[
				{
					"version": "0.6",
					"index_config": {
					"doc_mapping": {
						"timestamp_field": "sub.timestamp"
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
						"timestamp_field": "sub.timestamp2"
						},
						"indexing_settings": {},
						"retention": null
					},
					"sources": []
				}
			]
			`)

			// When
			_, _, err := DecodeTimestampFieldFromIndexConfigs(query)

			// Then
			require.Error(t, err)
			require.ErrorContains(t, err, "Index matching the pattern should have the same timestamp fields")
		})
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
