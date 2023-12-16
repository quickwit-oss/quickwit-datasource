package quickwit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
)

var qwlog = log.New()

type QuickwitDatasource struct {
	dsInfo es.DatasourceInfo
}

type QuickwitMapping struct {
	IndexConfig struct {
		DocMapping struct {
			TimestampField string `json:"timestamp_field"`
			FieldMappings  []struct {
				Name         string   `json:"name"`
				InputFormats []string `json:"input_formats"`
			} `json:"field_mappings"`
		} `json:"doc_mapping"`
	} `json:"index_config"`
}

type QuickwitCreationErrorPayload struct {
	Message    string `json:"message"`
	StatusCode int    `json:"status"`
}

func newErrorCreationPayload(statusCode int, message string) error {
	var payload QuickwitCreationErrorPayload
	payload.Message = message
	payload.StatusCode = statusCode
	json, err := json.Marshal(payload)
	if nil != err {
		return err
	}

	return errors.New(string(json))
}

func getTimestampFieldInfos(index string, qwUrl string, cli *http.Client) (string, string, error) {
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
		return "", "", newErrorCreationPayload(statusCode, errMsg)
	}

	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		errMsg := fmt.Sprintf("Error when calling url = %s: err = %s", mappingEndpointUrl, err.Error())
		qwlog.Error(errMsg)
		return "", "", newErrorCreationPayload(statusCode, errMsg)
	}

	var payload QuickwitMapping
	err = json.Unmarshal(body, &payload)
	if err != nil {
		errMsg := fmt.Sprintf("Unmarshalling body error: err = %s, body = %s", err.Error(), (body))
		qwlog.Error(errMsg)
		return "", "", newErrorCreationPayload(statusCode, errMsg)
	}

	timestampFieldName := payload.IndexConfig.DocMapping.TimestampField
	timestampFieldFormat := "undef"
	for _, field := range payload.IndexConfig.DocMapping.FieldMappings {
		if field.Name == timestampFieldName && len(field.InputFormats) > 0 {
			timestampFieldFormat = field.InputFormats[0]
			break
		}
	}

	if timestampFieldFormat == "undef" {
		errMsg := fmt.Sprintf("No format found for field: %s", string(timestampFieldName))
		qwlog.Error(errMsg)
		return timestampFieldName, "", newErrorCreationPayload(statusCode, errMsg)
	}

	qwlog.Info(fmt.Sprintf("Found timestampFieldName = %s, timestampFieldFormat = %s", timestampFieldName, timestampFieldFormat))
	return timestampFieldName, timestampFieldFormat, nil
}

// Creates a Quickwit datasource.
func NewQuickwitDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	qwlog.Debug("Initializing new data source instance")

	jsonData := map[string]interface{}{}
	err := json.Unmarshal(settings.JSONData, &jsonData)
	if err != nil {
		return nil, fmt.Errorf("error reading settings: %w", err)
	}
	httpCliOpts, err := settings.HTTPClientOptions()
	if err != nil {
		return nil, fmt.Errorf("error getting http options: %w", err)
	}

	// Set SigV4 service namespace
	if httpCliOpts.SigV4 != nil {
		httpCliOpts.SigV4.Service = "quicwkit"
	}

	httpCli, err := httpclient.New(httpCliOpts)
	if err != nil {
		return nil, err
	}

	timeField, toOk := jsonData["timeField"].(string)
	timeOutputFormat, tofOk := jsonData["timeOutputFormat"].(string)

	logLevelField, ok := jsonData["logLevelField"].(string)
	if !ok {
		logLevelField = ""
	}

	logMessageField, ok := jsonData["logMessageField"].(string)
	if !ok {
		logMessageField = ""
	}

	index, ok := jsonData["index"].(string)
	if !ok {
		index = ""
	}
	if index == "" {
		index = settings.Database
	}

	var maxConcurrentShardRequests float64

	switch v := jsonData["maxConcurrentShardRequests"].(type) {
	case float64:
		maxConcurrentShardRequests = v
	case string:
		maxConcurrentShardRequests, err = strconv.ParseFloat(v, 64)
		if err != nil {
			maxConcurrentShardRequests = 256
		}
	default:
		maxConcurrentShardRequests = 256
	}

	if !toOk || !tofOk {
		timeField, timeOutputFormat, err = getTimestampFieldInfos(index, settings.URL, httpCli)
		if nil != err {
			return nil, err
		}
	}

	configuredFields := es.ConfiguredFields{
		TimeField:        timeField,
		TimeOutputFormat: timeOutputFormat,
		LogLevelField:    logLevelField,
		LogMessageField:  logMessageField,
	}

	model := es.DatasourceInfo{
		ID:                         settings.ID,
		URL:                        settings.URL,
		HTTPClient:                 httpCli,
		Database:                   index,
		MaxConcurrentShardRequests: int64(maxConcurrentShardRequests),
		ConfiguredFields:           configuredFields,
	}
	return &QuickwitDatasource{dsInfo: model}, nil
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (ds *QuickwitDatasource) Dispose() {
	// Clean up datasource instance resources.
	// TODO
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (ds *QuickwitDatasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	res := &backend.CheckHealthResult{}

	res.Status = backend.HealthStatusOk
	res.Message = "plugin is running"
	return res, nil
}

func (ds *QuickwitDatasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	return queryData(ctx, req.Queries, &ds.dsInfo)
}

func (ds *QuickwitDatasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// allowed paths for resource calls:
	// - empty string for fetching db version
	// - ?/_mapping for fetching index mapping
	// - _msearch for executing getTerms queries
	if req.Path != "" && !strings.Contains(req.Path, "indexes/") && req.Path != "_elastic/_msearch" {
		return fmt.Errorf("invalid resource URL: %s", req.Path)
	}

	qwUrl, err := url.Parse(ds.dsInfo.URL)
	if err != nil {
		return err
	}

	resourcePath, err := url.Parse(req.Path)
	if err != nil {
		return err
	}

	// We take the path and the query-string only
	qwUrl.RawQuery = resourcePath.RawQuery
	qwUrl.Path = path.Join(qwUrl.Path, resourcePath.Path)

	request, err := http.NewRequestWithContext(ctx, req.Method, qwUrl.String(), bytes.NewBuffer(req.Body))
	if err != nil {
		return err
	}

	response, err := ds.dsInfo.HTTPClient.Do(request)
	if err != nil {
		return err
	}

	defer func() {
		if err := response.Body.Close(); err != nil {
			qwlog.Warn("Failed to close response body", "err", err)
		}
	}()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}

	responseHeaders := map[string][]string{
		"content-type": {"application/json"},
	}

	if response.Header.Get("Content-Encoding") != "" {
		responseHeaders["content-encoding"] = []string{response.Header.Get("Content-Encoding")}
	}

	return sender.Send(&backend.CallResourceResponse{
		Status:  response.StatusCode,
		Headers: responseHeaders,
		Body:    body,
	})
}
