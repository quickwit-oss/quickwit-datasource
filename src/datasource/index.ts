import { cloneDeep, first as _first, map as _map, groupBy } from 'lodash';
import { Observable, lastValueFrom, from, isObservable, of } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';

import {
  AbstractQuery,
  AdHocVariableFilter,
  CoreApp,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  DataSourceJsonData,
  DataSourceWithLogsContextSupport,
  DataSourceWithQueryImportSupport,
  DataSourceWithSupplementaryQueriesSupport,
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
  ScopedVars,
  SupplementaryQueryType,
  TimeRange,
} from '@grafana/data';
import { BucketAggregation, DataLinkConfig, ElasticsearchQuery, TermsQuery, FieldCapabilitiesResponse } from '@/types';
import { 
  DataSourceWithBackend, 
  getTemplateSrv, 
  TemplateSrv } from '@grafana/runtime';
import { QuickwitOptions } from 'quickwit';
import { getDataQuery } from 'QueryBuilder/elastic';
import { colors } from '@grafana/ui';

import { BarAlignment, DataQuery, GraphDrawStyle, StackingMode } from '@grafana/schema';
import { metricAggregationConfig } from 'components/QueryEditor/MetricAggregationsEditor/utils';
import { isMetricAggregationWithField } from 'components/QueryEditor/MetricAggregationsEditor/aggregations';
import { bucketAggregationConfig } from 'components/QueryEditor/BucketAggregationsEditor/utils';
import { isBucketAggregationWithField } from 'components/QueryEditor/BucketAggregationsEditor/aggregations';
import ElasticsearchLanguageProvider from 'LanguageProvider';
import { ReactNode } from 'react';
import { fieldTypeMap } from 'utils';
import { addAddHocFilter } from 'modifyQuery';
import { LogContextProvider, LogRowContextOptions } from '@/LogContext/LogContextProvider';
import { getQueryResponseProcessor } from 'datasource/processResponse';

export const REF_ID_STARTER_LOG_VOLUME = 'log-volume-';

export type ElasticDatasource = QuickwitDataSource;

type FieldCapsSpec = {
  aggregatable?: boolean,
  searchable?: boolean,
  type?: string[],
  _range?: TimeRange
}

export class QuickwitDataSource
  extends DataSourceWithBackend<ElasticsearchQuery, QuickwitOptions>
  implements
    DataSourceWithLogsContextSupport,
    DataSourceWithSupplementaryQueriesSupport<ElasticsearchQuery>,
    DataSourceWithQueryImportSupport<ElasticsearchQuery>
{
  index: string;
  timeField: string;
  logMessageField?: string;
  logLevelField?: string;
  dataLinks: DataLinkConfig[];
  languageProvider: ElasticsearchLanguageProvider;

  private logContextProvider: LogContextProvider;

  constructor(
    instanceSettings: DataSourceInstanceSettings<QuickwitOptions>,
    private readonly templateSrv: TemplateSrv = getTemplateSrv()
    ) {
    super(instanceSettings);
    const settingsData = instanceSettings.jsonData || ({} as QuickwitOptions);
    this.index = settingsData.index || '';
    this.timeField = ''
    this.logMessageField = settingsData.logMessageField || '';
    this.logLevelField = settingsData.logLevelField || '';
    this.dataLinks = settingsData.dataLinks || [];
    this.languageProvider = new ElasticsearchLanguageProvider(this);
    this.logContextProvider = new LogContextProvider(this);
  }

  query(request: DataQueryRequest<ElasticsearchQuery>): Observable<DataQueryResponse> {
    const queryProcessor = getQueryResponseProcessor(this, request)
     return super.query(request) .pipe(map(queryProcessor.processResponse));
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
    const backendCheck = from(this.callHealthCheck()).pipe(
      mergeMap((res) => {
        return of({
          status: res.status.toLowerCase(),
          message: res.message
        })
      })
    )

    return lastValueFrom(backendCheck)
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

  getDataQueryRequest(queryDef: TermsQuery, range: TimeRange) {
    let dataQuery = getDataQuery(queryDef, 'getTerms');
    const request: DataQueryRequest = {
      app: CoreApp.Unknown,
      requestId: 'GetTerms',
      interval: '',
      intervalMs: 0,
      range,
      targets:[dataQuery],
      timezone:'browser',
      scopedVars:{},
      startTime: Date.now(),
    }
    return request
  }

  getTerms(queryDef: TermsQuery, range = getDefaultTimeRange()): Observable<MetricFindValue[]> {
    const dataquery = this.getDataQueryRequest(queryDef, range)
    return super.query(dataquery).pipe(
      mergeMap(res=> res.data.map((df: DataFrame)=>{

        return df.fields[0]!.values.map((bucket)=>({
          text: bucket,
          value: bucket,
        }))
      })
      )
    )
  }

  getFields(spec: FieldCapsSpec={}, range = getDefaultTimeRange()): Observable<MetricFindValue[]> {
    return from(this.getResource('_elastic/' + this.index + '/_field_caps', {
      start_timestamp: Math.floor(range.from.valueOf()/SECOND),
      end_timestamp: Math.ceil(range.to.valueOf()/SECOND),
    })).pipe(
      map((field_capabilities_response: FieldCapabilitiesResponse) => {
        const shouldAddField = (field: any) => {
          if (spec.aggregatable !== undefined && field.aggregatable !== spec.aggregatable) {
            return false
          }
          if (spec.searchable !== undefined && field.searchable !== spec.searchable){
            return false
          }
          if (spec.type && spec.type.length !== 0 && !(spec.type.includes(field.type) || spec.type.includes(fieldTypeMap[field.type]))) {
            return false
          }
          return true
        };
        const fieldCapabilities = Object.entries(field_capabilities_response.fields)
          .flatMap(([field_name, field_capabilities]) => {
            return Object.values(field_capabilities)
              .map(field_capability => {
                field_capability.field_name = field_name;
                return field_capability;
              });
          })
          .filter(shouldAddField)
          .map(field_capability => {
            return {
              text: field_capability.field_name,
              value: fieldTypeMap[field_capability.type],  
            }
          });
        const uniquefieldCapabilities = fieldCapabilities.filter((field_capability, index, self) =>
          index === self.findIndex((t) => (
            t.text === field_capability.text && t.value === field_capability.value
          ))
        ).sort((a, b) => a.text.localeCompare(b.text));
        return uniquefieldCapabilities;
      })
    );
  }

  /**
   * Get tag keys for adhoc filters
   */
  getTagKeys(spec?: FieldCapsSpec) {
    return lastValueFrom(this.getFields(spec));
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

  // Log Context

  // NOTE : deprecated since grafana-data 10.3
  showContextToggle(row?: LogRowModel | undefined): boolean {
    return true;
  }

  getLogRowContext = async (
      row: LogRowModel,
      options?: LogRowContextOptions,
      origQuery?: ElasticsearchQuery
      ): Promise<{ data: DataFrame[] }> => {
    return await this.logContextProvider.getLogRowContext(row, options, origQuery);
  }

  getLogRowContextUi(
    row: LogRowModel,
    runContextQuery?: (() => void),
    origQuery?: ElasticsearchQuery
    ): ReactNode {
    return this.logContextProvider.getLogRowContextUi(row, runContextQuery, origQuery);
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
      if (parsedQuery.find === 'fields') {
        parsedQuery.type = this.interpolateLuceneQuery(parsedQuery.type);
        return lastValueFrom(this.getFields({aggregatable:true, type:parsedQuery.type, _range:range}));
      }
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

  interpolateVariablesInQueries(queries: ElasticsearchQuery[], scopedVars: ScopedVars | {}, filters?: AdHocVariableFilter[]): ElasticsearchQuery[] {
    return queries.map((q) => this.applyTemplateVariables(q, scopedVars, filters));
  }

  // Used when running queries through backend
  applyTemplateVariables(query: ElasticsearchQuery, scopedVars: ScopedVars, filters?: AdHocVariableFilter[]): ElasticsearchQuery {
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
      query: this.addAdHocFilters(this.interpolateLuceneQuery(query.query || '', scopedVars), filters),
      bucketAggs: query.bucketAggs?.map(interpolateBucketAgg),
    };

    const finalQuery = JSON.parse(this.templateSrv.replace(JSON.stringify(expandedQuery), scopedVars));
    return finalQuery;
  }

  addAdHocFilters(query: string, adhocFilters?: AdHocVariableFilter[]) {
    if (!adhocFilters) {
      return query;
    }
    let finalQuery = query;
    adhocFilters.forEach((filter) => {
      finalQuery = addAddHocFilter(finalQuery, filter);
    });

    return finalQuery;
  }
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
  const intervalInfo = getIntervalInfo(timespan, 400);

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


function getIntervalInfo(timespanMs: number, resolution: number): { interval: string; intervalMs?: number } {
  let intervalMs = timespanMs / resolution;
  let interval = '';

  // below 5 seconds we force the resolution to be per 1ms as interval in scopedVars is not less than 10ms
  if (timespanMs < SECOND * 5) {
    intervalMs = MILLISECOND;
    interval = '1ms';
  } else if (intervalMs > HOUR) {
    intervalMs = DAY;
    interval = '1d';
  } else if (intervalMs > 10*MINUTE) {
    intervalMs = HOUR;
    interval = '1h';
  } else if (intervalMs > MINUTE) {
    intervalMs = 10*MINUTE;
    interval = '10m';
  } else if (intervalMs > 10*SECOND) {
    intervalMs = MINUTE;
    interval = '1m';
  } else if (intervalMs > SECOND) {
    intervalMs = 10*SECOND;
    interval = '10s';
  } else {
    intervalMs = SECOND;
    interval = '1s';
  }

  return { interval, intervalMs };
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