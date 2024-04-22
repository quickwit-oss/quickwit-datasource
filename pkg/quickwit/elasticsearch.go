package quickwit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"

	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
)

// separate function to allow testing the whole transformation and query flow
func queryData(ctx context.Context, dataQueries []backend.DataQuery, dsInfo *es.DatasourceInfo) (*backend.QueryDataResponse, error) {

	// First validate and parse
	if len(dataQueries) == 0 {
		return &backend.QueryDataResponse{}, fmt.Errorf("query contains no queries")
	}

	queries, err := parseQuery(dataQueries)
	if err != nil {
		return nil, err
	}

	// Create a request
	// NODE : Params should probably be assembled in a dedicated structure to be reused by parseResponse
	req, err := buildMSR(queries, dsInfo.ConfiguredFields.TimeField)
	if err != nil {
		return &backend.QueryDataResponse{}, err
	}

	// Create a client and execute request
	client, err := es.NewClient(ctx, dsInfo)
	if err != nil {
		return &backend.QueryDataResponse{}, err
	}
	res, err := client.ExecuteMultisearch(req)

	// TODO : refactor client error handling
	result, err := handleQuickwitErrors(err)
	if result != nil {
		return result, nil
	} else if err != nil {
		return &backend.QueryDataResponse{}, err
	}

	return parseResponse(res.Responses, queries, dsInfo.ConfiguredFields)
}

func handleQuickwitErrors(err error) (*backend.QueryDataResponse, error) {
	if nil == err {
		return nil, nil
	}

	var payload = err.Error()
	var qe es.QuickwitQueryError
	unmarshall_err := json.Unmarshal([]byte(payload), &qe)
	if unmarshall_err == nil {
		return nil, err
	}

	result := backend.QueryDataResponse{
		Responses: backend.Responses{},
	}

	result.Responses["__queryDataError"] = backend.ErrDataResponse(backend.Status(qe.Status), payload)
	return &result, nil
}
