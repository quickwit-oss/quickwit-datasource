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
			TimestampField string `json:"timestamp_field"`
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
func GetTimestampField(index string, qwickwitUrl string, cli *http.Client) (string, error) {
	if strings.Contains(index, "*") || strings.Contains(index, ",") {
		return GetTimestampFieldFromIndexPattern(index, qwickwitUrl, cli)
	}
	return GetTimestampFieldFromIndex(index, qwickwitUrl, cli)
}

func GetTimestampFieldFromIndex(index string, qwickwitUrl string, cli *http.Client) (string, error) {
	mappingEndpointUrl := qwickwitUrl + "/indexes/" + index
	qwlog.Debug("Calling quickwit endpoint: " + mappingEndpointUrl)
	r, err := cli.Get(mappingEndpointUrl)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", err
	}

	statusCode := r.StatusCode

	if statusCode < 200 || statusCode >= 400 {
		errMsg := fmt.Sprintf("Error when calling url = %s", mappingEndpointUrl)
		qwlog.Error(errMsg)
		return "", NewErrorCreationPayload(statusCode, errMsg)
	}

	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", NewErrorCreationPayload(statusCode, errMsg)
	}

	return DecodeTimestampFieldFromIndexConfig(body)
}

func GetTimestampFieldFromIndexPattern(indexPattern string, qwickwitUrl string, cli *http.Client) (string, error) {
	mappingEndpointUrl := qwickwitUrl + "/indexes?index_id_pattern=" + indexPattern
	qwlog.Debug("Calling quickwit endpoint: " + mappingEndpointUrl)
	r, err := cli.Get(mappingEndpointUrl)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", err
	}

	statusCode := r.StatusCode

	if statusCode < 200 || statusCode >= 400 {
		errMsg := fmt.Sprintf("Error when calling url = %s", mappingEndpointUrl)
		qwlog.Error(errMsg)
		return "", NewErrorCreationPayload(statusCode, errMsg)
	}

	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", NewErrorCreationPayload(statusCode, errMsg)
	}

	return DecodeTimestampFieldFromIndexConfigs(body)
}

func DecodeTimestampFieldFromIndexConfigs(body []byte) (string, error) {
	var payload []QuickwitIndexMetadata
	err := json.Unmarshal(body, &payload)
	if err != nil {
		errMsg := fmt.Sprintf("Unmarshalling body error: err = %s, body = %s", err.Error(), (body))
		qwlog.Error(errMsg)
		return "", NewErrorCreationPayload(500, errMsg)
	}

	var timestampFieldName string = ""
	for _, indexMetadata := range payload {
		if timestampFieldName == "" {
			timestampFieldName = indexMetadata.IndexConfig.DocMapping.TimestampField
			continue
		}

		if timestampFieldName != indexMetadata.IndexConfig.DocMapping.TimestampField {
			errMsg := fmt.Sprintf("Index matching the pattern should have the same timestamp fields, two found: %s and %s", timestampFieldName, indexMetadata.IndexConfig.DocMapping.TimestampField)
			qwlog.Error(errMsg)
			return "", NewErrorCreationPayload(400, errMsg)
		}
	}

	qwlog.Debug(fmt.Sprintf("Found timestampFieldName = %s", timestampFieldName))
	return timestampFieldName, nil
}

func DecodeTimestampFieldFromIndexConfig(body []byte) (string, error) {
	var payload QuickwitIndexMetadata
	err := json.Unmarshal(body, &payload)
	if err != nil {
		errMsg := fmt.Sprintf("Unmarshalling body error: err = %s, body = %s", err.Error(), (body))
		qwlog.Error(errMsg)
		return "", NewErrorCreationPayload(500, errMsg)
	}
	timestampFieldName := payload.IndexConfig.DocMapping.TimestampField
	qwlog.Debug(fmt.Sprintf("Found timestampFieldName = %s", timestampFieldName))
	return timestampFieldName, nil
}
