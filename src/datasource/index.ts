import { BaseQuickwitDataSource } from './base';

import { withSupplementaryQueries } from './supplementaryQueries';

const mixins = [
  withSupplementaryQueries,
]
const qwds = mixins.reduce(( qwds, fn) => fn(qwds), BaseQuickwitDataSource)
export class QuickwitDataSource extends qwds {
    constructor(first: any, ...rest: any[]){
      super(first, ...[])
    }
}

export type ElasticDatasource = BaseQuickwitDataSource
