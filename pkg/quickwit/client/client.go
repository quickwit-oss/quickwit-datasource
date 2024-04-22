package es

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

type ReadyStatus struct {
	IsReady bool
	Err     error
}

type DatasourceInfo struct {
	ID                         int64
	HTTPClient                 *http.Client
	URL                        string
	Database                   string
	ConfiguredFields           ConfiguredFields
	MaxConcurrentShardRequests int64
	ReadyStatus                chan ReadyStatus
	ShouldInit                 bool
}

type ConfiguredFields struct {
	TimeField        string
	TimeOutputFormat string
	LogMessageField  string
	LogLevelField    string
}

// Client represents a client which can interact with elasticsearch api
type Client interface {
	ExecuteMultisearch(r []*SearchRequest) (*MultiSearchResponse, error)
}

// NewClient creates a new Quickwit client
var NewClient = func(ctx context.Context, ds *DatasourceInfo) (Client, error) {
	logger := log.New()
	logger.Debug("Creating new client", "index", ds.Database)

	return &baseClientImpl{
		logger: logger,
		ctx:    ctx,
		ds:     ds,
		index:  ds.Database,
	}, nil
}

type baseClientImpl struct {
	ctx    context.Context
	ds     *DatasourceInfo
	index  string
	logger log.Logger
}

type multiRequest struct {
	header   map[string]interface{}
	body     interface{}
	interval time.Duration
}

func (c *baseClientImpl) encodeBatchRequests(requests []*multiRequest) ([]byte, error) {
	c.logger.Debug("Encoding batch requests to json", "batch requests", len(requests))
	start := time.Now()

	payload := bytes.Buffer{}
	for _, r := range requests {
		reqHeader, err := json.Marshal(r.header)
		if err != nil {
			return nil, err
		}
		payload.WriteString(string(reqHeader) + "\n")

		reqBody, err := json.Marshal(r.body)

		if err != nil {
			return nil, err
		}

		body := string(reqBody)
		body = strings.ReplaceAll(body, "$__interval_ms", strconv.FormatInt(r.interval.Milliseconds(), 10))
		body = strings.ReplaceAll(body, "$__interval", r.interval.String())

		payload.WriteString(body + "\n")
	}

	elapsed := time.Since(start)
	c.logger.Debug("Encoded batch requests to json", "took", elapsed)

	return payload.Bytes(), nil
}

func (c *baseClientImpl) makeRequest(method, uriPath, uriQuery string, body []byte) (*http.Request, error) {
	u, err := url.Parse(c.ds.URL)
	if err != nil {
		return nil, err
	}
	u.Path = path.Join(u.Path, uriPath)
	u.RawQuery = uriQuery

	var req *http.Request
	if method == http.MethodPost {
		req, err = http.NewRequestWithContext(c.ctx, http.MethodPost, u.String(), bytes.NewBuffer(body))
	} else {
		req, err = http.NewRequestWithContext(c.ctx, http.MethodGet, u.String(), nil)
	}
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	return req, nil
}

func (c *baseClientImpl) ExecuteMultisearch(requests []*SearchRequest) (*MultiSearchResponse, error) {
	c.logger.Debug("Executing multisearch", "search requests", requests)

	req, err := c.createMultiSearchRequests(requests)
	if err != nil {
		return nil, err
	}

	res, err := c.ds.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			c.logger.Warn("Failed to close response body", "err", err)
		}
	}()

	c.logger.Debug("Received multisearch response", "code", res.StatusCode, "status", res.Status, "content-length", res.ContentLength)

	if res.StatusCode >= 400 {
		qe := QuickwitQueryError{
			Status:       res.StatusCode,
			Message:      "Error on multisearch",
			ResponseBody: res.Body,
			QueryParam:   req.URL.RawQuery,
			RequestBody:  requests,
		}

		errorPayload, _ := json.Marshal(qe)
		c.logger.Error(string(errorPayload))
		return nil, fmt.Errorf(string(errorPayload))
	}

	start := time.Now()
	c.logger.Debug("Decoding multisearch json response")

	var msr MultiSearchResponse
	dec := json.NewDecoder(res.Body)
	err = dec.Decode(&msr)
	if err != nil {
		return nil, err
	}

	elapsed := time.Since(start)
	c.logger.Debug("Decoded multisearch json response", "took", elapsed)

	return &msr, nil
}

func (c *baseClientImpl) createMultiSearchRequests(searchRequests []*SearchRequest) (*http.Request, error) {
	multiRequests := []*multiRequest{}

	for _, searchReq := range searchRequests {
		mr := multiRequest{
			header: map[string]interface{}{
				"ignore_unavailable": true,
				"index":              strings.Split(c.index, ","),
			},
			body:     searchReq,
			interval: searchReq.Interval,
		}

		multiRequests = append(multiRequests, &mr)
	}

	bytes, err := c.encodeBatchRequests(multiRequests)
	if err != nil {
		return nil, err
	}

	queryParams := c.getMultiSearchQueryParameters()

	return c.makeRequest(http.MethodPost, "_elastic/_msearch", queryParams, bytes)
}

func (c *baseClientImpl) getMultiSearchQueryParameters() string {
	var qs []string

	maxConcurrentShardRequests := c.ds.MaxConcurrentShardRequests
	if maxConcurrentShardRequests == 0 {
		maxConcurrentShardRequests = 5
	}
	qs = append(qs, fmt.Sprintf("max_concurrent_shard_requests=%d", maxConcurrentShardRequests))
	return strings.Join(qs, "&")
}
