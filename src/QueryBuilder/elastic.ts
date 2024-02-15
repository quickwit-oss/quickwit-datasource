import {
  BucketAggregation,
  ElasticsearchQuery,
  MetricAggregation,
  TermsQuery,
} from '../types';


type OrderByType =  '_key' | '_term' | '_count'

function getTermsAgg(
  fieldName: string,
  size: number,
  orderBy: OrderByType = "_key",
  order: 'asc'|'desc' = 'asc'
  ): BucketAggregation {
  return {
    type: 'terms',
    id: "",
    field: fieldName,
    settings:{
      size: size.toString(),
      order: order,
      orderBy: orderBy,
    }
  }
}

export function getDataQuery(queryDef: TermsQuery, refId: string): ElasticsearchQuery {
  const metrics: MetricAggregation[] = [
    {id:"count1", type:'count'}
  ];

  // Default behaviour is to order results by { _key: asc }
  // queryDef.order allows selection of asc/desc
  // queryDef.orderBy allows selection of doc_count ordering (defaults desc)

  let orderBy: OrderByType;
  switch (queryDef.orderBy || 'key') {
    case 'key':
    case 'term':
      orderBy = '_key'
      break;
    case 'doc_count':
      orderBy = '_count'
      break;
    default:
      throw { message: `Invalid query sort type ${queryDef.orderBy}` };
  }

  const {order = orderBy === '_count' ? 'desc' : 'asc' } = queryDef;
  if (['asc', 'desc'].indexOf(order) < 0) {
    throw { message: `Invalid query sort order ${order}` };
  }

  const bucketAggs: BucketAggregation[] = [];
  if (queryDef.field) {
    bucketAggs.push(getTermsAgg(queryDef.field, 500, orderBy, order))
  }

  return {
    refId,
    metrics,
    bucketAggs,
    query: queryDef.query,
  }
}
