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

// TODO: Move ConfiguredFields closer to handlers, the client layer doesn't need this stuff
type ConfiguredFields struct {
	TimeField        string
	TimeOutputFormat string
	LogMessageField  string
	LogLevelField    string
}

// Client represents a client which can interact with elasticsearch api
type Client interface {
	ExecuteMultisearch(r []*SearchRequest) ([]*json.RawMessage, error)
}

var logger = log.New()

// NewClient creates a new Quickwit client
var NewClient = func(ctx context.Context, ds *DatasourceInfo) (Client, error) {
	logger.Debug("Creating new client", "index", ds.Database)

	return &baseClientImpl{
		ctx:   ctx,
		ds:    ds,
		index: ds.Database,
	}, nil
}

type baseClientImpl struct {
	ctx   context.Context
	ds    *DatasourceInfo
	index string
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

// Multisearch uses a shallow unmarshalled struct to defer the decoding to downstream handlers
type MultiSearchResponse struct {
	Responses []*json.RawMessage `json:"responses"`
}

func (c *baseClientImpl) ExecuteMultisearch(requests []*SearchRequest) ([]*json.RawMessage, error) {
	req, err := c.createMultiSearchRequest(requests, c.index)
	if err != nil {
		return nil, err
	}

	res, err := c.ds.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			logger.Warn("Failed to close response body", "err", err)
		}
	}()

	logger.Debug("Received multisearch response", "code", res.StatusCode, "status", res.Status, "content-length", res.ContentLength)

	if res.StatusCode >= 400 {
		qe := QuickwitQueryError{
			Status:       res.StatusCode,
			Message:      "Error on multisearch",
			ResponseBody: res.Body,
			QueryParam:   req.URL.RawQuery,
			RequestBody:  requests,
		}

		errorPayload, _ := json.Marshal(qe)
		logger.Error(string(errorPayload))
		return nil, fmt.Errorf("%s", string(errorPayload))
	}

	start := time.Now()
	logger.Debug("Decoding multisearch json response")

	var msr MultiSearchResponse
	dec := json.NewDecoder(res.Body)
	err = dec.Decode(&msr)
	if err != nil {
		return nil, err
	}

	elapsed := time.Since(start)
	logger.Debug("Decoded multisearch json response", "took", elapsed)

	return msr.Responses, nil
}

func (c *baseClientImpl) makeMultiSearchPayload(searchRequests []*SearchRequest, index string) ([]byte, error) {
	// Format, marshall and interpolate
	payload := bytes.Buffer{}
	for _, r := range searchRequests {
		header := map[string]interface{}{
			"ignore_unavailable": true,
			"index":              strings.Split(index, ","),
		}
		reqHeader, err := json.Marshal(header)
		if err != nil {
			return nil, err
		}
		payload.WriteString(string(reqHeader) + "\n")

		reqBody, err := json.Marshal(r)

		if err != nil {
			return nil, err
		}

		body := string(reqBody)
		body = strings.ReplaceAll(body, "$__interval_ms", strconv.FormatInt(r.Interval.Milliseconds(), 10))
		body = strings.ReplaceAll(body, "$__interval", r.Interval.String())

		payload.WriteString(body + "\n")
	}
	return payload.Bytes(), nil
}

func (c *baseClientImpl) createMultiSearchRequest(requests []*SearchRequest, index string) (*http.Request, error) {
	body, err := c.makeMultiSearchPayload(requests, index)
	if err != nil {
		return nil, err
	}

	var qs []string
	maxConcurrentShardRequests := c.ds.MaxConcurrentShardRequests
	if maxConcurrentShardRequests == 0 {
		maxConcurrentShardRequests = 5
	}
	qs = append(qs, fmt.Sprintf("max_concurrent_shard_requests=%d", maxConcurrentShardRequests))
	queryParams := strings.Join(qs, "&")

	return c.makeRequest(http.MethodPost, "_elastic/_msearch", queryParams, body)
}
