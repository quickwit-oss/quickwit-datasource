package quickwit

import (
	"context"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"

	es "github.com/quickwit-oss/quickwit-datasource/pkg/quickwit/client"
)

// separate function to allow testing the whole transformation and query flow
func queryData(ctx context.Context, queries []backend.DataQuery, dsInfo *es.DatasourceInfo) (*backend.QueryDataResponse, error) {
	if len(queries) == 0 {
		return &backend.QueryDataResponse{}, fmt.Errorf("query contains no queries")
	}

	client, err := es.NewClient(ctx, dsInfo, queries[0].TimeRange)
	if err != nil {
		return &backend.QueryDataResponse{}, err
	}
	query := newElasticsearchDataQuery(client, queries)
	return query.execute()
}
