package quickwit

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

type QuickwitIndexMetadata struct {
	IndexConfig struct {
		IndexID    string `json:"index_id"`
		DocMapping struct {
			TimestampField string          `json:"timestamp_field"`
			FieldMappings  []FieldMappings `json:"field_mappings"`
		} `json:"doc_mapping"`
	} `json:"index_config"`
}

type QuickwitCreationErrorPayload struct {
	Message    string `json:"message"`
	StatusCode int    `json:"status"`
}

// TODO: Revamp error handling
func NewErrorCreationPayload(statusCode int, message string) error {
	var payload QuickwitCreationErrorPayload
	payload.Message = message
	payload.StatusCode = statusCode
	json, err := json.Marshal(payload)
	if nil != err {
		return err
	}

	return errors.New(string(json))
}

func FilterErrorResponses(r *http.Response) (*http.Response, error) {
	if r.StatusCode < 200 || r.StatusCode >= 400 {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, NewErrorCreationPayload(r.StatusCode, fmt.Errorf("failed to read error body: err = %w", err).Error())
		}
		return nil, NewErrorCreationPayload(r.StatusCode, fmt.Sprintf("error = %s", (body)))
	}
	return r, nil
}

func GetTimestampFieldInfos(indexMetadataList []QuickwitIndexMetadata) (string, string, error) {
	if len(indexMetadataList) == 0 {
		return "", "", fmt.Errorf("index metadata list is empty")
	}

	refTimestampFieldName, refTimestampOutputFormat := FindTimestampFieldInfos(indexMetadataList[0])
	if refTimestampFieldName == "" || refTimestampOutputFormat == "" {
		return "", "", fmt.Errorf("Invalid timestamp field infos for %s: %s, %s", indexMetadataList[0].IndexConfig.IndexID, refTimestampFieldName, refTimestampOutputFormat)
	}

	for _, indexMetadata := range indexMetadataList[1:] {
		timestampFieldName, timestampOutputFormat := FindTimestampFieldInfos(indexMetadata)

		if timestampFieldName != refTimestampFieldName || timestampOutputFormat != refTimestampOutputFormat {
			return "", "", fmt.Errorf("Indexes matching pattern have incompatible timestamp fields, found: %s (%s) and %s (%s)", refTimestampFieldName, refTimestampOutputFormat, timestampFieldName, timestampOutputFormat)
		}
	}

	return refTimestampFieldName, refTimestampOutputFormat, nil
}

func GetIndexesMetadata(indexPattern string, qwickwitUrl string, cli *http.Client) ([]QuickwitIndexMetadata, error) {
	mappingEndpointUrl := qwickwitUrl + "/indexes?index_id_patterns=" + indexPattern
	qwlog.Debug("Calling quickwit endpoint: " + mappingEndpointUrl)
	r, err := cli.Get(mappingEndpointUrl)
	if err != nil {
		return nil, fmt.Errorf("Error when calling url = %s: %w", mappingEndpointUrl, err)
	}
	defer r.Body.Close()

	r, err = FilterErrorResponses(r)
	if err != nil {
		return nil, fmt.Errorf("API returned invalid response: %w", err)
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var payload []QuickwitIndexMetadata
	err = json.Unmarshal(body, &payload)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal response body: %w", err)
	}

	return payload, nil
}

func FindTimestampFieldInfos(indexMetadata QuickwitIndexMetadata) (string, string) {
	timestampFieldName := indexMetadata.IndexConfig.DocMapping.TimestampField
	timestampOutputFormat, _ := FindTimestampFormat(timestampFieldName, nil, indexMetadata.IndexConfig.DocMapping.FieldMappings)
	return timestampFieldName, timestampOutputFormat
}

func FindTimestampFormat(timestampFieldName string, parentName *string, fieldMappings []FieldMappings) (string, bool) {
	if nil == fieldMappings {
		return "", false
	}

	for _, field := range fieldMappings {
		fieldName := field.Name
		if nil != parentName {
			fieldName = fmt.Sprintf("%s.%s", *parentName, fieldName)
		}
		if field.Type == "datetime" && fieldName == timestampFieldName && nil != field.OutputFormat {
			return *field.OutputFormat, true
		} else if field.Type == "object" && nil != field.FieldMappings {
			if result, found := FindTimestampFormat(timestampFieldName, &field.Name, field.FieldMappings); found {
				return result, true
			}
		}
	}

	qwlog.Debug(fmt.Sprintf("FindTimestampFormat: no match found for %s", timestampFieldName))
	return "", false
}
