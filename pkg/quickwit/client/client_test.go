package es

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/simplejson"
)

func TestClient_ExecuteMultisearch(t *testing.T) {
	t.Run("Given a fake http client and a client with response", func(t *testing.T) {
		var request *http.Request
		var requestBody *bytes.Buffer

		ts := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			request = r
			buf, err := io.ReadAll(r.Body)
			require.NoError(t, err)

			requestBody = bytes.NewBuffer(buf)

			rw.Header().Set("Content-Type", "application/x-ndjson")
			_, err = rw.Write([]byte(
				`{
				"responses": [
					{
						"hits": {	"hits": [], "max_score": 0,	"total": { "value": 4656, "relation": "eq"}	},
						"status": 200
					}
				]
			}`))
			require.NoError(t, err)
			rw.WriteHeader(200)
		}))

		configuredFields := ConfiguredFields{
			TimeField:       "testtime",
			LogMessageField: "line",
			LogLevelField:   "lvl",
		}

		ds := DatasourceInfo{
			URL:                        ts.URL,
			HTTPClient:                 ts.Client(),
			Database:                   "my-index",
			ConfiguredFields:           configuredFields,
			MaxConcurrentShardRequests: 6,
		}

		c, err := NewClient(context.Background(), &ds)
		require.NoError(t, err)
		require.NotNil(t, c)

		t.Cleanup(func() {
			ts.Close()
		})

		ms, err := createMultisearchForTest(t)
		require.NoError(t, err)
		res, err := c.ExecuteMultisearch(ms)
		require.NoError(t, err)

		require.NotNil(t, request)
		assert.Equal(t, http.MethodPost, request.Method)
		assert.Equal(t, "/_elastic/_msearch", request.URL.Path)
		assert.Equal(t, "max_concurrent_shard_requests=6", request.URL.RawQuery)

		require.NotNil(t, requestBody)

		headerBytes, err := requestBody.ReadBytes('\n')
		require.NoError(t, err)
		bodyBytes := requestBody.Bytes()

		jHeader, err := simplejson.NewJson(headerBytes)
		require.NoError(t, err)

		jBody, err := simplejson.NewJson(bodyBytes)
		require.NoError(t, err)

		assert.Equal(t, "my-index", jHeader.Get("index").MustStringArray()[0])
		assert.True(t, jHeader.Get("ignore_unavailable").MustBool(false))
		assert.Empty(t, jHeader.Get("max_concurrent_shard_requests"))
		assert.False(t, jHeader.Get("ignore_throttled").MustBool())

		assert.Equal(t, "15000*@hostname", jBody.GetPath("aggs", "2", "aggs", "1", "avg", "script").MustString())

		assert.Equal(t, "15s", jBody.GetPath("aggs", "2", "date_histogram", "fixed_interval").MustString())

		require.Len(t, res, 1)
	})
}

func createMultisearchForTest(t *testing.T) ([]*SearchRequest, error) {
	t.Helper()

	msb := NewMultiSearchRequestBuilder()
	s := msb.Search(15 * time.Second)
	s.Agg().DateHistogram("2", "@timestamp", func(a *DateHistogramAgg, ab AggBuilder) {
		a.FixedInterval = "$__interval"

		ab.Metric("1", "avg", "@hostname", func(a *MetricAggregation) {
			a.Settings["script"] = "$__interval_ms*@hostname"
		})
	})
	return msb.Build()
}
