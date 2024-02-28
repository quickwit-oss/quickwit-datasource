import { BaseQuickwitDataSource } from './base';

import { withSupplementaryQueries } from './supplementaryQueries';
import { withLogContext } from './logsContext';
import { withSizeLimitedLogsRequests } from './queryLimits';

const mixins = [
  withLogContext,
  withSupplementaryQueries,
  withSizeLimitedLogsRequests(100),
]
const qwds = mixins.reduce(( qwds, fn) => fn(qwds), BaseQuickwitDataSource)
export class QuickwitDataSource extends qwds {
    constructor(first: any, ...rest: any[]){
      super(first, ...[])
    }
}

export type ElasticDatasource = BaseQuickwitDataSource
