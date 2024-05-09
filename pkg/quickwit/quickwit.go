package quickwit

import (
	"bytes"
	"context"
	"encoding/json"
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

type FieldMappings struct {
	Name          string          `json:"name"`
	Type          string          `json:"type"`
	OutputFormat  *string         `json:"output_format,omitempty"`
	FieldMappings []FieldMappings `json:"field_mappings,omitempty"`
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
	httpCliOpts.ForwardHTTPHeaders = true

	// Set SigV4 service namespace
	if httpCliOpts.SigV4 != nil {
		httpCliOpts.SigV4.Service = "quickwit"
	}

	httpCli, err := httpclient.New(httpCliOpts)
	if err != nil {
		return nil, err
	}

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
	// XXX : Legacy check, should not happen ?
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

	configuredFields := es.ConfiguredFields{
		LogLevelField:    logLevelField,
		LogMessageField:  logMessageField,
		TimeField:        "",
		TimeOutputFormat: "",
	}

	model := es.DatasourceInfo{
		ID:                         settings.ID,
		URL:                        settings.URL,
		HTTPClient:                 httpCli,
		Database:                   index,
		MaxConcurrentShardRequests: int64(maxConcurrentShardRequests),
		ConfiguredFields:           configuredFields,
		ReadyStatus:                make(chan es.ReadyStatus, 1),
		ShouldInit:                 true,
	}

	ds := &QuickwitDatasource{dsInfo: model}

	// Create an initialization goroutine
	go func(ds *QuickwitDatasource, readyStatus chan<- es.ReadyStatus) {
		var status es.ReadyStatus = es.ReadyStatus{
			IsReady: false,
			Err:     nil,
		}
		for {
			// Will retry init everytime the channel is consumed until ready
			if !status.IsReady || ds.dsInfo.ShouldInit {
				qwlog.Debug("Initializing Datasource")
				status.IsReady = true
				status.Err = nil

				indexMetadataList, err := GetIndexesMetadata(ds.dsInfo.Database, ds.dsInfo.URL, ds.dsInfo.HTTPClient)
				if err != nil {
					status.IsReady = false
					status.Err = fmt.Errorf("failed to get index metadata : %w", err)
				} else if len(indexMetadataList) == 0 {
					status.IsReady = false
					status.Err = fmt.Errorf("no index found for %s", ds.dsInfo.Database)
				} else {
					timeField, timeOutputFormat, err := GetTimestampFieldInfos(indexMetadataList)
					if nil != err {
						status.IsReady = false
						status.Err = err
					} else if "" == timeField {
						status.IsReady = false
						status.Err = fmt.Errorf("timefield is empty for %s", ds.dsInfo.Database)
					} else if "" == timeOutputFormat {
						status.Err = fmt.Errorf("timefield's output_format is empty, logs timestamps will not be parsed correctly for %s", ds.dsInfo.Database)
					}

					ds.dsInfo.ConfiguredFields.TimeField = timeField
					ds.dsInfo.ConfiguredFields.TimeOutputFormat = timeOutputFormat
					ds.dsInfo.ShouldInit = false
				}
			}
			readyStatus <- status
		}
	}(ds, model.ReadyStatus)
	return ds, nil
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (ds *QuickwitDatasource) Dispose() {
	// FIXME: The ReadyStatus channel should probably be closed here, but doing it
	// causes odd calls to healthcheck to fail. Needs investigation
	// close(ds.dsInfo.ReadyStatus)
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (ds *QuickwitDatasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	res := &backend.CheckHealthResult{}
	res.Status = backend.HealthStatusOk
	res.Message = "plugin is running"

	ds.dsInfo.ShouldInit = true
	status := <-ds.dsInfo.ReadyStatus

	if nil != status.Err {
		res.Status = backend.HealthStatusError
		res.Message = fmt.Errorf("Failed to initialize datasource: %w", status.Err).Error()
	} else if "" == ds.dsInfo.ConfiguredFields.TimeField {
		res.Status = backend.HealthStatusError
		res.Message = fmt.Sprintf("timefield is missing from index config \"%s\"", ds.dsInfo.Database)
	} else if "" == ds.dsInfo.ConfiguredFields.TimeOutputFormat {
		res.Status = backend.HealthStatusError
		res.Message = fmt.Sprintf("timefield's output_format is missing from index config \"%s\"", ds.dsInfo.Database)
	}
	qwlog.Debug(res.Message)

	return res, nil
}

func (ds *QuickwitDatasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// Ensure ds is initialized, we need timestamp infos
	status := <-ds.dsInfo.ReadyStatus
	if !status.IsReady {
		qwlog.Debug(fmt.Errorf("Datasource initialization failed: %w", status.Err).Error())
		response := &backend.QueryDataResponse{
			Responses: backend.Responses{},
		}
		response.Responses["__qwQueryDataError"] = backend.ErrDataResponse(backend.StatusInternal, "Datasource initialization failed")
		return response, nil
	}

	return queryData(ctx, req.Queries, &ds.dsInfo)
}

func (ds *QuickwitDatasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// allowed paths for resource calls:
	// - empty string for fetching db version
	// - ?/_mapping for fetching index mapping
	// - _msearch for executing getTerms queries
	// - _field_caps for getting all the aggregeables fields
	var isFieldCaps = req.Path != "" && strings.Contains(req.Path, "_elastic") && strings.Contains(req.Path, "/_field_caps")
	if req.Path != "" && !strings.Contains(req.Path, "indexes/") && req.Path != "_elastic/_msearch" && !isFieldCaps {
		return fmt.Errorf("invalid resource URL: %s", req.Path)
	}

	qwUrl, err := url.Parse(ds.dsInfo.URL)
	if err != nil {
		return err
	}

	resourcePath, err := url.Parse(req.URL)
	if err != nil {
		return err
	}

	// We take the path and the query-string only
	qwUrl.RawQuery = resourcePath.RawQuery
	qwUrl.Path = path.Join(qwUrl.Path, resourcePath.Path)

	qwlog.Debug("CallResource", "url", qwUrl.String())

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
