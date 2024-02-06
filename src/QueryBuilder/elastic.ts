import {
  TermsQuery,
} from '../types';

export class ElasticQueryBuilder {
  timeField: string;

  constructor(options: { timeField: string }) {
    this.timeField = options.timeField;
  }

  getRangeFilter() {
    const filter: any = {};
    filter[this.timeField] = {
      gte: '$timeFrom',
      lte: '$timeTo',
      // FIXME when Quickwit supports format.
      // format: 'epoch_millis',
    };

    return filter;
  }

  getTermsQuery(queryDef: TermsQuery) {
    const query: any = {
      size: 0,
      query: {
        bool: {
          filter: [{ range: this.getRangeFilter() }],
        },
      },
    };

    if (queryDef.query) {
      query.query.bool.filter.push({
        query_string: {
          // FIXME when Quickwit supports analyze_wildcard.
          // analyze_wildcard: true,
          query: queryDef.query,
        },
      });
    }

    let size = 500;
    if (queryDef.size) {
      size = queryDef.size;
    }

    query.aggs = {
      '1': {
        terms: {
          field: queryDef.field,
          size: size,
          order: {},
        },
      },
    };

    // Default behaviour is to order results by { _key: asc }
    // queryDef.order allows selection of asc/desc
    // queryDef.orderBy allows selection of doc_count ordering (defaults desc)

    const { orderBy = 'key', order = orderBy === 'doc_count' ? 'desc' : 'asc' } = queryDef;

    if (['asc', 'desc'].indexOf(order) < 0) {
      throw { message: `Invalid query sort order ${order}` };
    }

    switch (orderBy) {
      case 'key':
      case 'term':
        const keyname = '_key';
        query.aggs['1'].terms.order[keyname] = order;
        break;
      case 'doc_count':
        query.aggs['1'].terms.order['_count'] = order;
        break;
      default:
        throw { message: `Invalid query sort type ${orderBy}` };
    }

    return query;
  }
}
