import { cloneDeep, first as _first, map as _map, groupBy } from 'lodash';
import { Observable, lastValueFrom, from, isObservable, of } from 'rxjs';
import { catchError, mergeMap, map } from 'rxjs/operators';

import {
  AbstractQuery,
  ArrayVector,
  CoreApp,
  DataFrame,
  DataLink,
  DataQueryError,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  DataSourceJsonData,
  DataSourceWithLogsContextSupport,
  DataSourceWithQueryImportSupport,
  DataSourceWithSupplementaryQueriesSupport,
  dateTime,
  Field,
  FieldColorModeId,
  FieldType,
  getDefaultTimeRange,
  LoadingState,
  LogLevel,
  LogRowModel,
  LogsVolumeCustomMetaData,
  LogsVolumeType,
  MetricFindValue,
  QueryFixAction,
  rangeUtil,
  ScopedVars,
  SupplementaryQueryType,
  TimeRange,
} from '@grafana/data';
import { BucketAggregation, DataLinkConfig, ElasticsearchQuery, Field as QuickwitField, FieldMapping, IndexMetadata, Logs, TermsQuery } from './types';
import { 
  DataSourceWithBackend, 
  getTemplateSrv, 
  TemplateSrv,
  getDataSourceSrv } from '@grafana/runtime';
import { LogRowContextOptions, LogRowContextQueryDirection, QuickwitOptions } from 'quickwit';
import { ElasticQueryBuilder } from 'QueryBuilder';
import { colors } from '@grafana/ui';

import { BarAlignment, DataQuery, GraphDrawStyle, StackingMode } from '@grafana/schema';
import { metricAggregationConfig } from 'components/QueryEditor/MetricAggregationsEditor/utils';
import { isMetricAggregationWithField } from 'components/QueryEditor/MetricAggregationsEditor/aggregations';
import { bucketAggregationConfig } from 'components/QueryEditor/BucketAggregationsEditor/utils';
import { isBucketAggregationWithField } from 'components/QueryEditor/BucketAggregationsEditor/aggregations';
import ElasticsearchLanguageProvider from 'LanguageProvider';
import { ReactNode } from 'react';
import { extractJsonPayload } from 'utils';

export const REF_ID_STARTER_LOG_VOLUME = 'log-volume-';

export type ElasticDatasource = QuickwitDataSource;

export class QuickwitDataSource
  extends DataSourceWithBackend<ElasticsearchQuery, QuickwitOptions>
  implements
    DataSourceWithLogsContextSupport,
    DataSourceWithSupplementaryQueriesSupport<ElasticsearchQuery>,
    DataSourceWithQueryImportSupport<ElasticsearchQuery>
{
  index: string;
  timeField: string;
  timeOutputFormat: string;
  logMessageField?: string;
  logLevelField?: string;
  queryBuilder: ElasticQueryBuilder;
  dataLinks: DataLinkConfig[];
  languageProvider: ElasticsearchLanguageProvider;

  constructor(
    instanceSettings: DataSourceInstanceSettings<QuickwitOptions>,
    private readonly templateSrv: TemplateSrv = getTemplateSrv()
    ) {
    super(instanceSettings);
    const settingsData = instanceSettings.jsonData || ({} as QuickwitOptions);
    this.index = settingsData.index || '';
    this.timeField = ''
    this.timeOutputFormat = ''
    this.queryBuilder = new ElasticQueryBuilder({
      timeField: this.timeField,
    });
    from(this.getResource('indexes/' + this.index)).pipe(
      map((indexMetadata) => {
        let fields = getAllFields(indexMetadata.index_config.doc_mapping.field_mappings);
        let timestampFieldName = indexMetadata.index_config.doc_mapping.timestamp_field
        let timestampField = fields.find((field) => field.json_path === timestampFieldName);
        let timestampFormat = timestampField ? timestampField.field_mapping.output_format || '' : ''
        let timestampFieldInfos = { 'field': timestampFieldName, 'format': timestampFormat }
        return timestampFieldInfos
      }),
      catchError((err) => {
        if (!err.data || !err.data.error) {
          let err_source = extractJsonPayload(err.data.error)
          if(!err_source) {
            throw err
          }
        }

        // the error will be handle in the testDatasource function
        return of({'field': '', 'format': ''})
      })
    ).subscribe(result => {
      this.timeField = result.field;
      this.timeOutputFormat = result.format;
      this.queryBuilder = new ElasticQueryBuilder({
        timeField: this.timeField,
      });
    });
    
    this.logMessageField = settingsData.logMessageField || '';
    this.logLevelField = settingsData.logLevelField || '';
    this.dataLinks = settingsData.dataLinks || [];
    this.languageProvider = new ElasticsearchLanguageProvider(this);
  }

  query(request: DataQueryRequest<ElasticsearchQuery>): Observable<DataQueryResponse> {
     return super.query(request)
       .pipe(map((response) => {
          response.data.forEach((dataFrame) => {
            enhanceDataFrameWithDataLinks(dataFrame, this.dataLinks);
          });
         return response;
       }));
  }

    /**
     * Checks the plugin health
     * see public/app/features/datasources/state/actions.ts for what needs to be returned here
     */
  async testDatasource() {
    if (this.index === '' ) {
      return {
        status: 'error',
        message: 'Cannot save datasource, `index` is required',
      };
    }

    return lastValueFrom(
      from(this.getResource('indexes/' + this.index)).pipe(
        mergeMap((indexMetadata) => {
          let error = this.validateIndexConfig(indexMetadata);
          if (error) {
            return of({
              status: 'error',
              message: error,
            });
          }
          return of({ status: 'success', message: `Index OK. Time field name OK` });
        }),
        catchError((err) => {
          if (err.data && err.data.error) {
            let err_source = extractJsonPayload(err.data.error)
            if (err_source) {
              err = err_source
            }
          }

          if (err.status && err.status === 404) {
            return of({ status: 'error', message: 'Index does not exists.' });
          } else if (err.message) {
            return of({ status: 'error', message: err.message });
          } else {
            return of({ status: 'error', message: err.status });
          }
        })
      )
    );
  }

  validateIndexConfig(indexMetadata: IndexMetadata): string | undefined {
    // Check timestamp field.
    if (this.timeField === '') {
      return `Time field must not be empty`;
    }

    let fields = getAllFields(indexMetadata.index_config.doc_mapping.field_mappings);
    let timestampField = fields.find((field) => field.json_path === this.timeField);

    // Should never happen.
    if (timestampField === undefined) {
      return `No field named '${this.timeField}' found in the doc mapping. This should never happen.`;
    }

    let timeOutputFormat = timestampField.field_mapping.output_format || 'unknown';
    const supportedTimestampOutputFormats = ['unix_timestamp_secs', 'unix_timestamp_millis', 'unix_timestamp_micros', 'unix_timestamp_nanos', 'iso8601', 'rfc3339'];
    if (!supportedTimestampOutputFormats.includes(timeOutputFormat)) {
      return `Timestamp output format '${timeOutputFormat} is not yet supported.`;
    }
    return;
  }

  async importFromAbstractQueries(abstractQueries: AbstractQuery[]): Promise<ElasticsearchQuery[]> {
    // FIXME: this function does not seem to be used.
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
        extractLevel: (dataFrame: any) => getLogLevelFromKey(dataFrame || ''),
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
    return from(this.getResource('indexes/' + this.index)).pipe(
      map((index_metadata) => {
        const shouldAddField = (field: QuickwitField) => {
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
            value: typeMap[field.field_mapping.type]
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

  private makeLogContextDataRequest = (row: LogRowModel, options?: LogRowContextOptions) => {
    const direction = options?.direction || LogRowContextQueryDirection.Backward;
    const searchAfter = row.dataFrame.fields.find((f) => f.name === 'sort')?.values.get(row.rowIndex) ?? [row.timeEpochNs]

    const logQuery: Logs = {
      type: 'logs',
      id: '1',
      settings: {
        limit: options?.limit ? options?.limit.toString() : '10',
        // Sorting of results in the context query
        sortDirection: direction === LogRowContextQueryDirection.Backward ? 'desc' : 'asc',
        // Used to get the next log lines before/after the current log line using sort field of selected log line
        searchAfter: searchAfter,
      },
    };

    const query: ElasticsearchQuery = {
      refId: `log-context-${row.dataFrame.refId}-${direction}`,
      metrics: [logQuery],
      query: '',
    };

    const timeRange = createContextTimeRange(row.timeEpochMs, direction);
    const range = {
      from: timeRange.from,
      to: timeRange.to,
      raw: timeRange,
    };

    const interval = rangeUtil.calculateInterval(range, 1);

    const contextRequest: DataQueryRequest<ElasticsearchQuery> = {
      requestId: `log-context-request-${row.dataFrame.refId}-${options?.direction}`,
      targets: [query],
      interval: interval.interval,
      intervalMs: interval.intervalMs,
      range,
      scopedVars: {},
      timezone: 'UTC',
      app: CoreApp.Explore,
      startTime: Date.now(),
      hideFromInspector: true,
    };
    return contextRequest;
  };

  getLogRowContext = async (row: LogRowModel, options?: LogRowContextOptions): Promise<{ data: DataFrame[] }> => {
    const contextRequest = this.makeLogContextDataRequest(row, options);

    return lastValueFrom(
      this.query(contextRequest).pipe(
        catchError((err) => {
          const error: DataQueryError = {
            message: 'Error during context query. Please check JS console logs.',
            status: err.status,
            statusText: err.message,
          };
          throw error;
        })
      )
    );
  };

  showContextToggle(row?: LogRowModel | undefined): boolean {
    return true;
  }

  getLogRowContextUi?(row: LogRowModel, runContextQuery?: (() => void) | undefined): ReactNode {
    return true;
  }

  /**
   * Returns false if the query should be skipped
   */
  filterQuery(query: ElasticsearchQuery): boolean {
    if (query.hide) {
      return false;
    }
    return true;
  }

  metricFindQuery(query: string, options?: { range: TimeRange }): Promise<MetricFindValue[]> {
    const range = options?.range;
    const parsedQuery = JSON.parse(query);
    if (query) {
      // Interpolation of variables with a list of values for which we don't
      // know the field name is not supported yet.
      // if (parsedQuery.find === 'fields') {
      //   parsedQuery.type = this.interpolateLuceneQuery(parsedQuery.type);
      //   return lastValueFrom(this.getFields(parsedQuery.type, range));
      // }
      if (parsedQuery.find === 'terms') {
        parsedQuery.field = this.interpolateLuceneQuery(parsedQuery.field);
        parsedQuery.query = this.interpolateLuceneQuery(parsedQuery.query);
        return lastValueFrom(this.getTerms(parsedQuery, range));
      }
    }
    return Promise.resolve([]);
  }

  interpolateLuceneQuery(queryString: string, scopedVars?: ScopedVars) {
    return this.templateSrv.replace(queryString, scopedVars, formatQuery);
  }

  interpolateVariablesInQueries(queries: ElasticsearchQuery[], scopedVars: ScopedVars | {}): ElasticsearchQuery[] {
    return queries.map((q) => this.applyTemplateVariables(q, scopedVars));
  }

  // Used when running queries through backend
  applyTemplateVariables(query: ElasticsearchQuery, scopedVars: ScopedVars): ElasticsearchQuery {
    // We need a separate interpolation format for lucene queries, therefore we first interpolate any
    // lucene query string and then everything else
    const interpolateBucketAgg = (bucketAgg: BucketAggregation): BucketAggregation => {
      if (bucketAgg.type === 'filters') {
        return {
          ...bucketAgg,
          settings: {
            ...bucketAgg.settings,
            filters: bucketAgg.settings?.filters?.map((filter) => ({
              ...filter,
              query: this.interpolateLuceneQuery(filter.query, scopedVars) || '*',
            })),
          },
        };
      }

      return bucketAgg;
    };

    const expandedQuery = {
      ...query,
      datasource: this.getRef(),
      query: this.interpolateLuceneQuery(query.query || '', scopedVars),
      bucketAggs: query.bucketAggs?.map(interpolateBucketAgg),
    };

    const finalQuery = JSON.parse(this.templateSrv.replace(JSON.stringify(expandedQuery), scopedVars));
    return finalQuery;
  }
}

// Returns a flatten array of fields and nested fields found in the given `FieldMapping` array. 
function getAllFields(field_mappings: FieldMapping[]): QuickwitField[] {
  const fields: QuickwitField[] = [];
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
function getLogLevelFromKey(dataframe: DataFrame): LogLevel {
  const name = dataframe.fields[1].config.displayNameFromDS || ``;
  const level = (LogLevel as any)[name.toString().toLowerCase()];
  if (level) {
    return level;
  }
  return LogLevel.unknown;
}

function formatQuery(value: string | string[], variable: any): string {
  if (typeof value === 'string') {
    return luceneEscape(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '__empty__';
    }
    const fieldName = JSON.parse(variable.query).field;
    const quotedValues =  value.map((val) => '"' + luceneEscape(val) + '"');
    // Quickwit query language does not support fieldName:(value1 OR value2 OR....)
    // like lucene does.
    // When we know the fieldName, we can directly generate a query
    // fieldName:value1 OR fieldName:value2 OR ...
    // But when we don't know the fieldName, the simplest is to generate a query
    // with the IN operator. Unfortunately, IN operator does not work on JSON field.
    // TODO: fix that by using doing a regex on queryString to find the fieldName.
    // Note that variable.id gives the name of the template variable to interpolate,
    // so if we have `fieldName:${variable.id}` in the queryString, we can isolate
    // the fieldName.
    if (typeof fieldName !== 'string') {
      return 'IN [' + quotedValues.join(' ') + ']';
    }
    return quotedValues.join(' OR ' + fieldName + ':');
  } else {
    return luceneEscape(`${value}`);
  }
}

function luceneEscape(value: string) {
  if (isNaN(+value) === false) {
    return value;
  }

  return value.replace(/([\!\*\+\-\=<>\s\&\|\(\)\[\]\{\}\^\~\?\:\\/"])/g, '\\$1');
}

function base64ToHex(base64String: string) {
  const binaryString = window.atob(base64String);
  return Array.from(binaryString).map(char => {
      const byte = char.charCodeAt(0);
      return ('0' + byte.toString(16)).slice(-2);
  }).join('');
}

export function enhanceDataFrameWithDataLinks(dataFrame: DataFrame, dataLinks: DataLinkConfig[]) {
  if (!dataLinks.length) {
    return;
  }
  let fields_to_fix_condition = (field: Field) => {
    return dataLinks.filter((dataLink) => dataLink.field === field.name && dataLink.base64TraceId).length === 1;
  };
  const fields_to_keep  = dataFrame.fields.filter((field) => {
    return !fields_to_fix_condition(field)
  });
  let new_fields = dataFrame
    .fields
    .filter(fields_to_fix_condition)
    .map((field) => {
      let values = field.values.toArray().map((value) => {
        try {
          return base64ToHex(value);
        } catch (e) {
          console.warn("cannot convert value from base64 to hex", e);
          return value;
        };
      });
      return {
        ...field,
        values: new ArrayVector(values),
      }
    });

  if (new_fields.length === 0) {
    return;
  }

  dataFrame.fields = [new_fields[0], ...fields_to_keep];

  for (const field of dataFrame.fields) {
    const linksToApply = dataLinks.filter((dataLink) => dataLink.field === field.name);

    if (linksToApply.length === 0) {
      continue;
    }

    field.config = field.config || {};
    field.config.links = [...(field.config.links || [], linksToApply.map(generateDataLink))];
  }
}

function generateDataLink(linkConfig: DataLinkConfig): DataLink {
  const dataSourceSrv = getDataSourceSrv();

  if (linkConfig.datasourceUid) {
    const dsSettings = dataSourceSrv.getInstanceSettings(linkConfig.datasourceUid);

    return {
      title: linkConfig.urlDisplayLabel || '',
      url: '',
      internal: {
        query: { query: linkConfig.url },
        datasourceUid: linkConfig.datasourceUid,
        datasourceName: dsSettings?.name ?? 'Data source not found',
      },
    };
  } else {
    return {
      title: linkConfig.urlDisplayLabel || '',
      url: linkConfig.url,
    };
  }
}

function createContextTimeRange(rowTimeEpochMs: number, direction: string) {
  const offset = 7;
  // For log context, we want to request data from 7 subsequent/previous indices
  if (direction === LogRowContextQueryDirection.Forward) {
    return {
      from: dateTime(rowTimeEpochMs).utc(),
      to: dateTime(rowTimeEpochMs).add(offset, 'hours').utc(),
    };
  } else {
    return {
      from: dateTime(rowTimeEpochMs).subtract(offset, 'hours').utc(),
      to: dateTime(rowTimeEpochMs).utc(),
    };
  }
}
