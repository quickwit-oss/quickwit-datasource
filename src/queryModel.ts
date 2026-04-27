import { ElasticsearchQuery, MetricAggregation, QueryType } from './types';

const BARE_TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const TRACE_ID_FIELD_PATTERN = /^(trace_id|traceID|traceId)\s*:\s*"?[0-9a-f]{32}"?\s*$/i;

type QueryWithFlavor = ElasticsearchQuery & {
  queryType?: QueryType;
};

function isBareTraceId(query?: string): boolean {
  return BARE_TRACE_ID_PATTERN.test((query || '').trim());
}

function isTraceIdFieldQuery(query?: string): boolean {
  return TRACE_ID_FIELD_PATTERN.test((query || '').trim());
}

function canInferTraceLink(query: ElasticsearchQuery): boolean {
  const firstMetricType = query.metrics?.[0]?.type;
  return !firstMetricType || firstMetricType === 'logs' || firstMetricType === 'traces';
}

function toTraceIdQuery(query?: string): string {
  const rawQuery = (query || '').trim();
  if (isBareTraceId(rawQuery)) {
    return `trace_id:${rawQuery}`;
  }
  return query || '';
}

function traceMetricFrom(metric?: MetricAggregation): Extract<MetricAggregation, { type: 'traces' }> {
  const settings = (metric as { settings?: { limit?: string } } | undefined)?.settings || {};
  return {
    id: metric?.id || '1',
    type: 'traces',
    settings: {
      limit: settings.limit || '1000',
    },
  };
}

export function normalizeInternalLinkQuery(query: ElasticsearchQuery): ElasticsearchQuery {
  const queryWithFlavor = query as QueryWithFlavor;
  const firstMetric = query.metrics?.[0];
  const shouldNormalizeToTrace =
    queryWithFlavor.queryType === 'traces' ||
    firstMetric?.type === 'traces' ||
    (canInferTraceLink(query) && isBareTraceId(query.query)) ||
    (isTraceIdFieldQuery(query.query) && firstMetric?.type === 'logs');

  if (!shouldNormalizeToTrace) {
    return query;
  }

  const normalizedQuery = toTraceIdQuery(query.query);
  const alreadyNormalized =
    queryWithFlavor.queryType === 'traces' &&
    query.query === normalizedQuery &&
    query.metrics?.length === 1 &&
    query.metrics[0].type === 'traces' &&
    (query.bucketAggs?.length || 0) === 0;

  if (alreadyNormalized) {
    return query;
  }

  return {
    ...query,
    query: normalizedQuery,
    queryType: 'traces',
    metrics: [traceMetricFrom(firstMetric)],
    bucketAggs: [],
    filters: query.filters || [],
  } as QueryWithFlavor;
}
