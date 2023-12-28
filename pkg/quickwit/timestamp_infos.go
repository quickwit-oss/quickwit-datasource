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

func FindTimeStampFormat(timestampFieldName string, parentName *string, fieldMappings []FieldMappings) *string {
	if nil == fieldMappings {
		return nil
	}

	for _, field := range fieldMappings {
		fieldName := field.Name
		if nil != parentName {
			fieldName = fmt.Sprintf("%s.%s", *parentName, fieldName)
		}

		if field.Type == "datetime" && fieldName == timestampFieldName && nil != field.OutputFormat {
			return field.OutputFormat
		} else if field.Type == "object" && nil != field.FieldMappings {
			format := FindTimeStampFormat(timestampFieldName, &field.Name, field.FieldMappings)
			if nil != format {
				return format
			}
		}
	}

	return nil
}

func DecodeTimestampFieldInfos(statusCode int, body []byte) (string, string, error) {
	var payload QuickwitMapping
	err := json.Unmarshal(body, &payload)

	if err != nil {
		errMsg := fmt.Sprintf("Unmarshalling body error: err = %s, body = %s", err.Error(), (body))
		qwlog.Error(errMsg)
		return "", "", NewErrorCreationPayload(statusCode, errMsg)
	}

	timestampFieldName := payload.IndexConfig.DocMapping.TimestampField
	timestampFieldFormat := FindTimeStampFormat(timestampFieldName, nil, payload.IndexConfig.DocMapping.FieldMappings)

	if nil == timestampFieldFormat {
		errMsg := fmt.Sprintf("No format found for field: %s", string(timestampFieldName))
		qwlog.Error(errMsg)
		return timestampFieldName, "", NewErrorCreationPayload(statusCode, errMsg)
	}

	qwlog.Info(fmt.Sprintf("Found timestampFieldName = %s, timestampFieldFormat = %s", timestampFieldName, *timestampFieldFormat))
	return timestampFieldName, *timestampFieldFormat, nil
}

func GetTimestampFieldInfos(index string, qwUrl string, cli *http.Client) (string, string, error) {
	mappingEndpointUrl := qwUrl + "/indexes/" + index
	qwlog.Info("Calling quickwit endpoint: " + mappingEndpointUrl)
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

	return DecodeTimestampFieldInfos(statusCode, body)
}
