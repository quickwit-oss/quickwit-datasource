import {
  DataQueryRequest,
  DataSourceWithSupplementaryQueriesSupport,
  SupplementaryQueryType,
} from '@grafana/data';
import { cloneDeep } from "lodash";
import { BucketAggregation, ElasticsearchQuery } from '@/types';
import { BaseQuickwitDataSourceConstructor } from './base';

export const REF_ID_STARTER_LOG_VOLUME = 'log-volume-';

export function withSupplementaryQueries<T extends BaseQuickwitDataSourceConstructor> ( Base: T ){
  return class DSWithSupplementaryQueries extends Base implements DataSourceWithSupplementaryQueriesSupport<ElasticsearchQuery> {

  /**
   * Returns a DataQueryRequest for the supplementary query type.
   * Grafana's Explore layer handles the Observable lifecycle.
   */
  getSupplementaryRequest(
    type: SupplementaryQueryType,
    request: DataQueryRequest<ElasticsearchQuery>
  ): DataQueryRequest<ElasticsearchQuery> | undefined {
    switch (type) {
      case SupplementaryQueryType.LogsVolume:
        return this.getLogsVolumeRequest(request);
      default:
        return undefined;
    }
  }

  /**
   * Returns supplementary query types that data source supports.
   */
  getSupportedSupplementaryQueryTypes(): SupplementaryQueryType[] {
    return [SupplementaryQueryType.LogsVolume];
  }

  /**
   * Returns a supplementary query to be used to fetch supplementary data based on the provided type and original query.
   * If provided query is not suitable for provided supplementary query type, undefined should be returned.
   */
  getSupplementaryQuery(options: { type: SupplementaryQueryType }, query: ElasticsearchQuery): ElasticsearchQuery | undefined {
    if (!this.getSupportedSupplementaryQueryTypes().includes(options.type)) {
      return undefined;
    }

    switch (options.type) {
      case SupplementaryQueryType.LogsVolume: {
        // it has to be a logs-producing range-query
        const isQuerySuitable = !!(query.metrics?.length === 1 && query.metrics[0].type === 'logs');
        if (!isQuerySuitable) {
          return undefined;
        }
        const bucketAggs: BucketAggregation[] = [];
        const timeField = this.timeField ?? 'timestamp';

        if (this.logLevelField) {
          bucketAggs.push({
            id: '2',
            type: 'terms',
            settings: {
              min_doc_count: '0',
              size: '0',
              order: 'desc',
              orderBy: '_count',
            },
            field: this.logLevelField,
          });
        }
        bucketAggs.push({
          id: '3',
          type: 'date_histogram',
          settings: {
            interval: 'auto',
            min_doc_count: '0',
            trimEdges: '0',
          },
          field: timeField,
        });

        return {
          refId: `${REF_ID_STARTER_LOG_VOLUME}${query.refId}`,
          query: query.query,
          metrics: [{ type: 'count', id: '1' }],
          bucketAggs,
          filters: query.filters,
        };
      }

      default:
        return undefined;
    }
  }

  private getLogsVolumeRequest(
    request: DataQueryRequest<ElasticsearchQuery>
  ): DataQueryRequest<ElasticsearchQuery> | undefined {
    const logsVolumeRequest = cloneDeep(request);
    const targets = logsVolumeRequest.targets
      .map((target) => this.getSupplementaryQuery({ type: SupplementaryQueryType.LogsVolume }, target))
      .filter((query): query is ElasticsearchQuery => !!query);

    if (!targets.length) {
      return undefined;
    }

    return { ...logsVolumeRequest, targets };
  }
  };
}
