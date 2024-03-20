package quickwit

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type QuickwitIndexMetadata struct {
	IndexConfig struct {
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

// TODO: refactor either by using a timestamp alias suppprted by quickwit
// or by only using the `GetTimestampFieldFromIndexPattern` once the endpoint
// /indexes?index_id_pattern= is supported, which is after the next quickwit release > 0.7.1
func GetTimestampFieldInfos(index string, qwickwitUrl string, cli *http.Client) (string, string, error) {
	if strings.Contains(index, "*") || strings.Contains(index, ",") {
		return GetTimestampFieldFromIndexPattern(index, qwickwitUrl, cli)
	}
	return GetTimestampFieldFromIndex(index, qwickwitUrl, cli)
}

func GetTimestampFieldFromIndex(index string, qwickwitUrl string, cli *http.Client) (string, string, error) {
	mappingEndpointUrl := qwickwitUrl + "/indexes/" + index
	qwlog.Debug("Calling quickwit endpoint: " + mappingEndpointUrl)
	r, err := cli.Get(mappingEndpointUrl)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", "", err
	}

	statusCode := r.StatusCode

	if statusCode < 200 || statusCode >= 400 {
		errMsg := fmt.Sprintf("Error when calling url = %s", mappingEndpointUrl)
		qwlog.Error(errMsg)
		return "", "", NewErrorCreationPayload(statusCode, errMsg)
	}

	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", "", NewErrorCreationPayload(statusCode, errMsg)
	}

	return DecodeTimestampFieldFromIndexConfig(body)
}

func GetTimestampFieldFromIndexPattern(indexPattern string, qwickwitUrl string, cli *http.Client) (string, string, error) {
	mappingEndpointUrl := qwickwitUrl + "/indexes?index_id_patterns=" + indexPattern
	qwlog.Debug("Calling quickwit endpoint: " + mappingEndpointUrl)
	r, err := cli.Get(mappingEndpointUrl)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", "", err
	}

	statusCode := r.StatusCode

	if statusCode < 200 || statusCode >= 400 {
		errMsg := fmt.Sprintf("Error when calling url = %s", mappingEndpointUrl)
		qwlog.Error(errMsg)
		return "", "", NewErrorCreationPayload(statusCode, errMsg)
	}

	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", "", NewErrorCreationPayload(statusCode, errMsg)
	}

	return DecodeTimestampFieldFromIndexConfigs(body)
}

func DecodeTimestampFieldFromIndexConfigs(body []byte) (string, string, error) {
	var payload []QuickwitIndexMetadata
	err := json.Unmarshal(body, &payload)
	if err != nil {
		errMsg := fmt.Sprintf("Unmarshalling body error: err = %s, body = %s", err.Error(), (body))
		qwlog.Error(errMsg)
		return "", "", NewErrorCreationPayload(500, errMsg)
	}

	var refTimestampFieldName string = ""
	var refTimestampOutputFormat string = ""
	var timestampFieldName string = ""
	var timestampOutputFormat string = ""

	for _, indexMetadata := range payload {
		timestampFieldName = indexMetadata.IndexConfig.DocMapping.TimestampField
		timestampOutputFormat, _ = FindTimeStampFormat(timestampFieldName, nil, indexMetadata.IndexConfig.DocMapping.FieldMappings)

		if refTimestampFieldName == "" {
			refTimestampFieldName = timestampFieldName
			refTimestampOutputFormat = timestampOutputFormat
			continue
		}

		if timestampFieldName != refTimestampFieldName || timestampOutputFormat != refTimestampOutputFormat {
			errMsg := fmt.Sprintf("Index matching the pattern should have the same timestamp fields, two found: %s (%s) and %s (%s)", refTimestampFieldName, refTimestampOutputFormat, timestampFieldName, timestampOutputFormat)
			qwlog.Error(errMsg)
			return "", "", NewErrorCreationPayload(400, errMsg)
		}
	}

	qwlog.Debug(fmt.Sprintf("Found timestampFieldName = %s, timestamptOutputFormat = %s", timestampFieldName, timestampOutputFormat))
	return timestampFieldName, timestampOutputFormat, nil
}

func DecodeTimestampFieldFromIndexConfig(body []byte) (string, string, error) {
	var payload QuickwitIndexMetadata
	err := json.Unmarshal(body, &payload)
	if err != nil {
		errMsg := fmt.Sprintf("Unmarshalling body error: err = %s, body = %s", err.Error(), (body))
		qwlog.Error(errMsg)
		return "", "", NewErrorCreationPayload(500, errMsg)
	}
	timestampFieldName := payload.IndexConfig.DocMapping.TimestampField
	timestampFieldFormat, _ := FindTimeStampFormat(timestampFieldName, nil, payload.IndexConfig.DocMapping.FieldMappings)
	qwlog.Debug(fmt.Sprintf("Found timestampFieldName = %s", timestampFieldName))
	return timestampFieldName, timestampFieldFormat, nil
}

func FindTimeStampFormat(timestampFieldName string, parentName *string, fieldMappings []FieldMappings) (string, bool) {
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
			return FindTimeStampFormat(timestampFieldName, &field.Name, field.FieldMappings)
		}
	}

	return "", false
}
