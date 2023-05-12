import { cloneDeep, first as _first, map as _map, groupBy } from 'lodash';
import { Observable, lastValueFrom, from, isObservable, of } from 'rxjs';
import { catchError, mergeMap, map, tap } from 'rxjs/operators';

import {
  AbstractQuery,
  DataFrame,
  DataLink,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  getDefaultTimeRange,
  MetricFindValue,
  QueryFixAction,
  SupplementaryQueryType,
  TimeRange,
} from '@grafana/data';
import { trackQuery } from 'tracking';
import { BucketAggregation, DataLinkConfig, ElasticsearchQuery, Field, FieldMapping, TermsQuery } from './types';
import {
  getDataSourceSrv,
  DataSourceWithBackend,
} from '@grafana/runtime';
import { QuickwitOptions } from 'quickwit';
import { ElasticQueryBuilder } from 'QueryBuilder';
import { LogLevel } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { DataSourceJsonData } from '@grafana/data';
import { DataSourceApi } from '@grafana/data';
import { ScopedVars } from '@grafana/data';
import { LoadingState } from '@grafana/data';
import { FieldType } from '@grafana/data';
import { colors } from '@grafana/ui';
import { FieldColorModeId } from '@grafana/data';

import { GraphDrawStyle, BarAlignment, StackingMode } from '@grafana/schema';
import { LogsVolumeCustomMetaData } from '@grafana/data';
import { LogsVolumeType } from '@grafana/data';
import { DataSourceWithSupplementaryQueriesSupport } from '@grafana/data';
import { metricAggregationConfig } from 'components/QueryEditor/MetricAggregationsEditor/utils';
import { isMetricAggregationWithField } from 'components/QueryEditor/MetricAggregationsEditor/aggregations';
import { bucketAggregationConfig } from 'components/QueryEditor/BucketAggregationsEditor/utils';
import { isBucketAggregationWithField } from 'components/QueryEditor/BucketAggregationsEditor/aggregations';
import ElasticsearchLanguageProvider from 'LanguageProvider';


export const REF_ID_STARTER_LOG_VOLUME = 'log-volume-';

export type ElasticDatasource = QuickwitDataSource;

export class QuickwitDataSource
  extends DataSourceWithBackend<ElasticsearchQuery, QuickwitOptions>
  implements
    DataSourceWithSupplementaryQueriesSupport<ElasticsearchQuery>
{
  index: string;
  timeField: string;
  logMessageField?: string;
  logLevelField?: string;
  queryBuilder: ElasticQueryBuilder;
  dataLinks: DataLinkConfig[];
  languageProvider: ElasticsearchLanguageProvider;

  constructor(instanceSettings: DataSourceInstanceSettings<QuickwitOptions>) {
    super(instanceSettings);
    const settingsData = instanceSettings.jsonData || ({} as QuickwitOptions);
    this.index = settingsData.index || '';
    this.timeField = settingsData.timeField || '';
    this.logMessageField = settingsData.logMessageField || '';
    this.logLevelField = settingsData.logLevelField || '';
    this.queryBuilder = new ElasticQueryBuilder({
      timeField: this.timeField,
    });
    this.dataLinks = settingsData.dataLinks || [];
    this.languageProvider = new ElasticsearchLanguageProvider(this);
  }

  /**
   * Ideally final -- any other implementation may not work as expected
   */
  query(request: DataQueryRequest<ElasticsearchQuery>): Observable<DataQueryResponse> {
    const start = new Date();
    return super.query(request).pipe(tap((response) => trackQuery(response, request, start)));
  }

    /**
   * Checks the plugin health
   * see public/app/features/datasources/state/actions.ts for what needs to be returned here
   */
  async testDatasource() {
    return lastValueFrom(
      from(this.getResource('indexes/' + this.index)).pipe(
        mergeMap((index_metadata) => {
          if (index_metadata.index_config.doc_mapping.timestamp_field !== this.timeField) {
            return of({
              status: 'error',
              message: 'No timestamp field named ' + this.timeField + ' found',
            });
          }
          return of({ status: 'success', message: `Index OK. Time field name OK` });
        }),
        catchError((err) => {
          console.error(err);
          if (err.message) {
            return of({ status: 'error', message: err.message });
          } else {
            return of({ status: 'error', message: err.status });
          }
        })
      )
    );
  }

  async importFromAbstractQueries(abstractQueries: AbstractQuery[]): Promise<ElasticsearchQuery[]> {
    return abstractQueries.map((abstractQuery) => this.languageProvider.importFromAbstractQuery(abstractQuery));
  }

  /**
   * Returns an observable that will be used to fetch supplementary data based on the provided
   * supplementary query type and original request.
   */
  getDataProvider(
    type: SupplementaryQueryType,
    request: DataQueryRequest<ElasticsearchQuery>
  ): Observable<DataQueryResponse> | undefined {
    if (!this.getSupportedSupplementaryQueryTypes().includes(type)) {
      return undefined;
    }
    switch (type) {
      case SupplementaryQueryType.LogsVolume:
        return this.getLogsVolumeDataProvider(request);
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
  // FIXME: options should be of type SupplementaryQueryOptions but this type is not public.
  getSupplementaryQuery(options: any, query: ElasticsearchQuery): ElasticsearchQuery | undefined {
    if (!this.getSupportedSupplementaryQueryTypes().includes(options.type)) {
      return undefined;
    }

    let isQuerySuitable = false;

    switch (options.type) {
      case SupplementaryQueryType.LogsVolume:
        // it has to be a logs-producing range-query
        isQuerySuitable = !!(query.metrics?.length === 1 && query.metrics[0].type === 'logs');
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
              // FIXME: `missing` is not supported by Quickwit.
              // missing: LogLevel.unknown,
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
          timeField,
          bucketAggs,
        };

      default:
        return undefined;
    }
  }

  getLogsVolumeDataProvider(request: DataQueryRequest<ElasticsearchQuery>): Observable<DataQueryResponse> | undefined {
    const logsVolumeRequest = cloneDeep(request);
    const targets = logsVolumeRequest.targets
      .map((target) => this.getSupplementaryQuery({ type: SupplementaryQueryType.LogsVolume }, target))
      .filter((query): query is ElasticsearchQuery => !!query);

    if (!targets.length) {
      return undefined;
    }

    return queryLogsVolume(
      this,
      { ...logsVolumeRequest, targets },
      {
        range: request.range,
        targets: request.targets,
        extractLevel: (dataFrame: any) => getLogLevelFromKey(dataFrame.name || ''),
      }
    );
  }

  /**
   * Used in explore when user filters on a given log attribute.
    */
  modifyQuery(query: ElasticsearchQuery, action: QueryFixAction): ElasticsearchQuery {
    if (!action.options) {
      return query;
    }

    let expression = query.query ?? '';
    switch (action.type) {
      case 'ADD_FILTER': {
        if (expression.length > 0) {
          expression += ' AND ';
        }
        expression += `${action.options.key}:"${action.options.value}"`;
        break;
      }
      case 'ADD_FILTER_OUT': {
        if (expression.length > 0) {
          expression += ' AND ';
        }
        expression += `-${action.options.key}:"${action.options.value}"`;
        break;
      }
    }
    return { ...query, query: expression };
  }

  getTerms(queryDef: TermsQuery, range = getDefaultTimeRange()): Observable<MetricFindValue[]> {
    const header = JSON.stringify({
      ignore_unavailable: true,
      index: this.index,
    });
    let esQuery = JSON.stringify(this.queryBuilder.getTermsQuery(queryDef));
    esQuery = esQuery.replace(/\$timeFrom/g, range.from.valueOf().toString());
    esQuery = esQuery.replace(/\$timeTo/g, range.to.valueOf().toString());
    esQuery = header + '\n' + esQuery + '\n';
    const resourceOptions = {
      headers: {
        'content-type': 'application/x-ndjson'
      }
    };
    const termsObservable = from(this.postResource("_elastic/_msearch", esQuery, resourceOptions));

    return termsObservable.pipe(
      map((res) => {
        if (!res.responses[0].aggregations) {
          return [];
        }

        const buckets = res.responses[0].aggregations['1'].buckets;
        return _map(buckets, (bucket) => {
          return {
            text: bucket.key_as_string || bucket.key,
            value: bucket.key,
          };
        });
      })
    );
  }

  // TODO: instead of being a string, this could be a custom type representing all the elastic types
  // FIXME: This doesn't seem to return actual MetricFindValues, we should either change the return type
  // or fix the implementation.
  getFields(type?: string[], _range?: TimeRange): Observable<MetricFindValue[]> {
    const typeMap: Record<string, string> = {
      u64: 'number',
      i64: 'number',
      datetime: 'date',
      text: 'string',
    };
    console.log("types", type);
    return from(this.getResource('indexes/' + this.index)).pipe(
      map((index_metadata) => {
        const shouldAddField = (field: Field) => {
          const translated_type = typeMap[field.field_mapping.type];
          if (type?.length === 0) {
            return true;
          }
          return type?.includes(translated_type);
        };

        const fields = getAllFields(index_metadata.index_config.doc_mapping.field_mappings);
        const filteredFields = fields.filter(shouldAddField);

        // transform to array
        return _map(filteredFields, (field) => {
          return {
            text: field.json_path,
            value: typeMap[field.field_mapping.type],
          };
        });
      })
    );
  }

  /**
   * Get tag keys for adhoc filters
   */
  getTagKeys() {
    return lastValueFrom(this.getFields());
  }

  /**
   * Get tag values for adhoc filters
   */
  getTagValues(options: any) {
    const range = getDefaultTimeRange();
    return lastValueFrom(this.getTerms({ field: options.key }, range));
  }

  /**
   * Convert a query to a simple text string
   */
  getQueryDisplayText(query: ElasticsearchQuery) {
    // TODO: This might be refactored a bit.
    const metricAggs = query.metrics;
    const bucketAggs = query.bucketAggs;
    let text = '';

    if (query.query) {
      text += 'Query: ' + query.query + ', ';
    }

    text += 'Metrics: ';

    text += metricAggs?.reduce((acc, metric) => {
      const metricConfig = metricAggregationConfig[metric.type];

      let text = metricConfig.label + '(';

      if (isMetricAggregationWithField(metric)) {
        text += metric.field;
      }
      text += '), ';

      return `${acc} ${text}`;
    }, '');

    text += bucketAggs?.reduce((acc, bucketAgg, index) => {
      const bucketConfig = bucketAggregationConfig[bucketAgg.type];

      let text = '';
      if (index === 0) {
        text += ' Group by: ';
      }

      text += bucketConfig.label + '(';
      if (isBucketAggregationWithField(bucketAgg)) {
        text += bucketAgg.field;
      }

      return `${acc} ${text}), `;
    }, '');

    if (query.alias) {
      text += 'Alias: ' + query.alias;
    }

    return text;
  }
}

/**
 * Modifies dataframe and adds dataLinks from the config.
 * Exported for tests.
 */
export function enhanceDataFrame(dataFrame: DataFrame, dataLinks: DataLinkConfig[]) {
  const dataSourceSrv = getDataSourceSrv();

  if (!dataLinks.length) {
    return;
  }

  for (const field of dataFrame.fields) {
    const dataLinkConfig = dataLinks.find((dataLink) => field.name && field.name.match(dataLink.field));

    if (!dataLinkConfig) {
      continue;
    }

    let link: DataLink;

    if (dataLinkConfig.datasourceUid) {
      // @ts-ignore
      const dsSettings = dataSourceSrv.getInstanceSettings(dataLinkConfig.datasourceUid);

      link = {
        title: '',
        url: '',
        internal: {
          query: { query: dataLinkConfig.url },
          datasourceUid: dataLinkConfig.datasourceUid,
          // @ts-ignore
          datasourceName: dsSettings?.name ?? 'Data source not found',
        },
      };
    } else {
      link = {
        title: '',
        url: dataLinkConfig.url,
      };
    }

    field.config = field.config || {};
    field.config.links = [...(field.config.links || []), link];
  }
}

// Returns a flatten array of fields and nested fields found in the given `FieldMapping` array. 
function getAllFields(field_mappings: Array<FieldMapping>): Field[] {
  const fields: Field[] = [];
  for (const field_mapping of field_mappings) {
    if (field_mapping.type === 'object' && field_mapping.field_mappings !== undefined) {
      for (const child_field_mapping of getAllFields(field_mapping.field_mappings)) {
        fields.push({json_path: field_mapping.name + '.' + child_field_mapping.json_path, path_segments: [field_mapping.name].concat(child_field_mapping.path_segments), field_mapping: child_field_mapping.field_mapping})
      }
    } else {
      fields.push({json_path: field_mapping.name, path_segments: [field_mapping.name], field_mapping: field_mapping});
    }
  }

  return fields;
}

/**
 * Creates an observable, which makes requests to get logs volume and aggregates results.
 */
export function queryLogsVolume<TQuery extends DataQuery, TOptions extends DataSourceJsonData>(
  datasource: DataSourceApi<TQuery, TOptions>,
  logsVolumeRequest: DataQueryRequest<TQuery>,
  options: any
): Observable<DataQueryResponse> {
  const timespan = options.range.to.valueOf() - options.range.from.valueOf();
  const intervalInfo = getIntervalInfo(logsVolumeRequest.scopedVars, timespan);

  logsVolumeRequest.interval = intervalInfo.interval;
  logsVolumeRequest.scopedVars.__interval = { value: intervalInfo.interval, text: intervalInfo.interval };

  if (intervalInfo.intervalMs !== undefined) {
    logsVolumeRequest.intervalMs = intervalInfo.intervalMs;
    logsVolumeRequest.scopedVars.__interval_ms = { value: intervalInfo.intervalMs, text: intervalInfo.intervalMs };
  }

  logsVolumeRequest.hideFromInspector = true;

  return new Observable((observer) => {
    let logsVolumeData: DataFrame[] = [];
    observer.next({
      state: LoadingState.Loading,
      error: undefined,
      data: [],
    });

    const queryResponse = datasource.query(logsVolumeRequest);
    const queryObservable = isObservable(queryResponse) ? queryResponse : from(queryResponse);

    const subscription = queryObservable.subscribe({
      complete: () => {
        observer.complete();
      },
      next: (dataQueryResponse: DataQueryResponse) => {
        const { error } = dataQueryResponse;
        if (error !== undefined) {
          observer.next({
            state: LoadingState.Error,
            error,
            data: [],
          });
          observer.error(error);
        } else {
          const framesByRefId = groupBy(dataQueryResponse.data, 'refId');
          logsVolumeData = dataQueryResponse.data.map((dataFrame) => {
            let sourceRefId = dataFrame.refId || '';
            if (sourceRefId.startsWith('log-volume-')) {
              sourceRefId = sourceRefId.substr('log-volume-'.length);
            }

            const logsVolumeCustomMetaData: LogsVolumeCustomMetaData = {
              logsVolumeType: LogsVolumeType.FullRange,
              absoluteRange: { from: options.range.from.valueOf(), to: options.range.to.valueOf() },
              datasourceName: datasource.name,
              sourceQuery: options.targets.find((dataQuery: any) => dataQuery.refId === sourceRefId)!,
            };

            dataFrame.meta = {
              ...dataFrame.meta,
              custom: {
                ...dataFrame.meta?.custom,
                ...logsVolumeCustomMetaData,
              },
            };
            return updateLogsVolumeConfig(dataFrame, options.extractLevel, framesByRefId[dataFrame.refId].length === 1);
          });

          observer.next({
            state: dataQueryResponse.state,
            error: undefined,
            data: logsVolumeData,
          });
        }
      },
      error: (error: any) => {
        observer.next({
          state: LoadingState.Error,
          error: error,
          data: [],
        });
        observer.error(error);
      },
    });
    return () => {
      subscription?.unsubscribe();
    };
  });
}

const updateLogsVolumeConfig = (
  dataFrame: DataFrame,
  extractLevel: (dataFrame: DataFrame) => LogLevel,
  oneLevelDetected: boolean
): DataFrame => {
  dataFrame.fields = dataFrame.fields.map((field) => {
    if (field.type === FieldType.number) {
      field.config = {
        ...field.config,
        ...getLogVolumeFieldConfig(extractLevel(dataFrame), oneLevelDetected),
      };
    }
    return field;
  });
  return dataFrame;
};

const LogLevelColor = {
  [LogLevel.critical]: colors[7],
  [LogLevel.warning]: colors[1],
  [LogLevel.error]: colors[4],
  [LogLevel.info]: colors[0],
  [LogLevel.debug]: colors[5],
  [LogLevel.trace]: colors[2],
  [LogLevel.unknown]: '#8e8e8e'// or '#bdc4cd',
};

/**
 * Returns field configuration used to render logs volume bars
 */
function getLogVolumeFieldConfig(level: LogLevel, oneLevelDetected: boolean) {
  const name = oneLevelDetected && level === LogLevel.unknown ? 'logs' : level;
  const color = LogLevelColor[level];
  return {
    displayNameFromDS: name,
    color: {
      mode: FieldColorModeId.Fixed,
      fixedColor: color,
    },
    custom: {
      drawStyle: GraphDrawStyle.Bars,
      barAlignment: BarAlignment.Center,
      lineColor: color,
      pointColor: color,
      fillColor: color,
      lineWidth: 1,
      fillOpacity: 100,
      stacking: {
        mode: StackingMode.Normal,
        group: 'A',
      },
    },
  };
}

const MILLISECOND = 1;
const SECOND = 1000 * MILLISECOND;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function getIntervalInfo(scopedVars: ScopedVars, timespanMs: number): { interval: string; intervalMs?: number } {
  if (scopedVars.__interval_ms) {
    let intervalMs: number = scopedVars.__interval_ms.value;
    let interval = '';
    // below 5 seconds we force the resolution to be per 1ms as interval in scopedVars is not less than 10ms
    if (timespanMs < SECOND * 5) {
      intervalMs = MILLISECOND;
      interval = '1ms';
    } else if (intervalMs > HOUR) {
      intervalMs = DAY;
      interval = '1d';
    } else if (intervalMs > MINUTE) {
      intervalMs = HOUR;
      interval = '1h';
    } else if (intervalMs > SECOND) {
      intervalMs = MINUTE;
      interval = '1m';
    } else {
      intervalMs = SECOND;
      interval = '1s';
    }

    return { interval, intervalMs };
  } else {
    return { interval: '$__interval' };
  }
}

// Copy/pasted from grafana/data as it is deprecated there.
function getLogLevelFromKey(key: string | number): LogLevel {
  const level = (LogLevel as any)[key.toString().toLowerCase()];
  if (level) {
    return level;
  }

  return LogLevel.unknown;
}
