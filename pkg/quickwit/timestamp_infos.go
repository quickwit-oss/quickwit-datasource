package quickwit

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

type QuickwitMapping struct {
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

func DecodeTimestampFieldInfos(statusCode int, body []byte) (string, error) {
	var payload QuickwitMapping
	err := json.Unmarshal(body, &payload)

	if err != nil {
		errMsg := fmt.Sprintf("Unmarshalling body error: err = %s, body = %s", err.Error(), (body))
		qwlog.Error(errMsg)
		return "", NewErrorCreationPayload(statusCode, errMsg)
	}

	timestampFieldName := payload.IndexConfig.DocMapping.TimestampField

	qwlog.Info(fmt.Sprintf("Found timestampFieldName = %s", timestampFieldName))
	return timestampFieldName, nil
}

func GetTimestampFieldInfos(index string, qwUrl string, cli *http.Client) (string, error) {
	mappingEndpointUrl := qwUrl + "/indexes/" + index
	qwlog.Info("Calling quickwit endpoint: " + mappingEndpointUrl)
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

	return DecodeTimestampFieldInfos(statusCode, body)
}
