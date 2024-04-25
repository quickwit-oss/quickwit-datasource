import { ReactNode } from 'react';
import { lastValueFrom, catchError } from 'rxjs';

import { BaseQuickwitDataSource } from '@/datasource/base';

import {
  CoreApp,
  DataFrame,
  DataQueryError,
  DataQueryRequest,
  LogRowModel,
  rangeUtil,
} from '@grafana/data';

import { ElasticsearchQuery, Logs, LogsSortDirection} from '../types';

import { LogContextUI } from './components/LogContextUI';
import { createContextTimeRange } from './utils';

export interface LogRowContextOptions {
    direction?: LogRowContextQueryDirection;
    limit?: number;
}
export enum LogRowContextQueryDirection {
    Backward = 'BACKWARD',
    Forward = 'FORWARD',
}

export class LogContextProvider {
  datasource: BaseQuickwitDataSource;
  contextQuery: string | null;

  constructor(datasource: BaseQuickwitDataSource) {
    this.datasource = datasource;
    this.contextQuery = null;
  }
  private makeLogContextDataRequest = (
    row: LogRowModel,
    options?: LogRowContextOptions,
    origQuery?: ElasticsearchQuery
    ) => {
    const direction = options?.direction || LogRowContextQueryDirection.Backward;
    const searchAfter = row.dataFrame.fields.find((f) => f.name === 'sort')?.values.get(row.rowIndex) ?? [row.timeEpochNs]

    const logQuery: Logs = {
      type: 'logs',
      id: '1',
      settings: {
        limit: options?.limit ? options?.limit.toString() : '10',
        // Sorting of results in the context query
        sortDirection: direction === LogRowContextQueryDirection.Backward ? LogsSortDirection.DESC : LogsSortDirection.ASC,
        // Used to get the next log lines before/after the current log line using sort field of selected log line
        searchAfter: searchAfter,
      },
    };

    const query: ElasticsearchQuery = {
      refId: `log-context-${row.dataFrame.refId}-${direction}`,
      metrics: [logQuery],
      query: this.contextQuery == null ? origQuery?.query : this.contextQuery,
    };

    const range = createContextTimeRange(row.timeEpochMs, direction);

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

  getLogRowContext = async (
        row: LogRowModel,
        options?: LogRowContextOptions,
        origQuery?: ElasticsearchQuery
    ): Promise<{ data: DataFrame[] }> => {
    const contextRequest = this.makeLogContextDataRequest(row, options, origQuery);

    return lastValueFrom(
      this.datasource.query(contextRequest).pipe(
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

  getLogRowContextUi(
      row: LogRowModel,
      runContextQuery?: (() => void),
      origQuery?: ElasticsearchQuery
  ): ReactNode {
    return ( LogContextUI({row, runContextQuery, origQuery, updateQuery: query=>{this.contextQuery=query}, datasource:this.datasource}))
  }
}
