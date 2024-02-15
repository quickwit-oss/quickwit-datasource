package quickwit

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDecodeTimestampFieldInfos(t *testing.T) {
	t.Run("Test decode timestam field infos", func(t *testing.T) {
		t.Run("Test decode simple fields", func(t *testing.T) {
			// Given
			query := []byte(`
				{
				  "version": "0.6",
				  "index_uid": "myindex:01HG7ZZK3ZD7XF6BKQCZJHSJ5W",
				  "index_config": {
					"version": "0.6",
					"index_id": "myindex",
					"index_uri": "s3://quickwit-indexes/myindex",
					"doc_mapping": {
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
					  ],
					  "tag_fields": [],
					  "store_source": true,
					  "index_field_presence": false,
					  "timestamp_field": "timestamp",
					  "mode": "dynamic",
					  "dynamic_mapping": {},
					  "partition_key": "foo",
					  "max_num_partitions": 1,
					  "tokenizers": []
					},
					"indexing_settings": {},
					"search_settings": {
					  "default_search_fields": [
						"foo"
					  ]
					},
					"retention": null
				  },
				  "checkpoint": {},
				  "create_timestamp": 1701075471,
				  "sources": []
				}
			`)

			// When
			timestampFieldName, err := DecodeTimestampFieldInfos(200, query)

			// Then
			require.NoError(t, err)
			require.Equal(t, timestampFieldName, "timestamp")
		})

		t.Run("Test decode nested fields", func(t *testing.T) {
			// Given
			query := []byte(`
				{
				  "version": "0.6",
				  "index_uid": "myindex:01HG7ZZK3ZD7XF6BKQCZJHSJ5W",
				  "index_config": {
					"version": "0.6",
					"index_id": "myindex",
					"index_uri": "s3://quickwit-indexes/myindex",
					"doc_mapping": {
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
							"name": "sub",
							"type": "object",
							"field_mappings": [
							  {
								"fast": true,
								"fast_precision": "seconds",
								"indexed": true,
								"input_formats": [
								  "rfc3339",
								  "unix_timestamp"
								],
								"name": "timestamp",
								"output_format": "rfc3339",
								"stored": true,
								"type": "datetime"
							  }
							]
						}
					  ],
					  "tag_fields": [],
					  "store_source": true,
					  "index_field_presence": false,
					  "timestamp_field": "sub.timestamp",
					  "mode": "dynamic",
					  "dynamic_mapping": {},
					  "partition_key": "foo",
					  "max_num_partitions": 1,
					  "tokenizers": []
					},
					"indexing_settings": {},
					"search_settings": {
					  "default_search_fields": [
						"foo"
					  ]
					},
					"retention": null
				  },
				  "checkpoint": {},
				  "create_timestamp": 1701075471,
				  "sources": []
				}
			`)

			// When
			timestampFieldName, err := DecodeTimestampFieldInfos(200, query)

			// Then
			require.NoError(t, err)
			require.Equal(t, timestampFieldName, "sub.timestamp")
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
