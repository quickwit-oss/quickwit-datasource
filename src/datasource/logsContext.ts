import { DataFrame, DataSourceWithLogsContextSupport, LogRowModel, } from '@grafana/data';
import {ElasticsearchQuery } from '@/types';

import { ReactNode } from 'react';
import { LogContextProvider, LogRowContextOptions } from '@/LogContext/LogContextProvider';

import { BaseQuickwitDataSourceConstructor } from './base';

export function withLogContext<T extends BaseQuickwitDataSourceConstructor  > ( Base: T ){
  return class DSWithLogsContext extends Base implements DataSourceWithLogsContextSupport {
    protected logContextProvider: LogContextProvider;
      // Log Context
  constructor(...args: any[]){
    super(...args)
    this.logContextProvider = new LogContextProvider(this);
  }
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

  };
}
