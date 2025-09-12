import { metricAggregationConfig, pipelineOptions } from './components/QueryEditor/MetricAggregationsEditor/utils';
import {
  ElasticsearchQuery,
  ExtendedStat,
  MetricAggregation,
  MovingAverageModelOption,
  MetricAggregationType,
  DateHistogram,
  QueryFilter,
} from './types';
import { newFilterId } from '@/utils/uid';

export const extendedStats: ExtendedStat[] = [
  { label: 'Avg', value: 'avg' },
  { label: 'Min', value: 'min' },
  { label: 'Max', value: 'max' },
  { label: 'Sum', value: 'sum' },
  { label: 'Count', value: 'count' },
  { label: 'Std Dev', value: 'std_deviation' },
  { label: 'Std Dev Upper', value: 'std_deviation_bounds_upper' },
  { label: 'Std Dev Lower', value: 'std_deviation_bounds_lower' },
];

export const movingAvgModelOptions: MovingAverageModelOption[] = [
  { label: 'Simple', value: 'simple' },
  { label: 'Linear', value: 'linear' },
  { label: 'Exponentially Weighted', value: 'ewma' },
  { label: 'Holt Linear', value: 'holt' },
  { label: 'Holt Winters', value: 'holt_winters' },
];

export function defaultMetricAgg(id = '1'): MetricAggregation {
  return { type: 'count', id };
}

export function defaultBucketAgg(id = '1'): DateHistogram {
  return { type: 'date_histogram', id, settings: { interval: 'auto' } };
}

export const filterOperations = [
  { label: 'is', value: '=~' },
  { label: 'is not', value: '!~' },
  { label: 'equals', value: '=' },
  { label: 'not equals', value: '!=' },
  { label: 'exists', value: 'exists' },
  { label: 'not exists', value: 'not exists' },
];

export function defaultFilter(id = newFilterId()): QueryFilter {
  return { id, filter: { key: '', operator: filterOperations[0].value, value: '' } };
}

export const findMetricById = (metrics: MetricAggregation[], id: MetricAggregation['id']) =>
  metrics.find((metric) => metric.id === id);

export function hasMetricOfType(target: ElasticsearchQuery, type: MetricAggregationType): boolean {
  return !!target?.metrics?.some((m) => m.type === type);
}

// Even if we have type guards when building a query, we currently have no way of getting this information from the response.
// We should try to find a better (type safe) way of doing the following 2.
export function isPipelineAgg(metricType: MetricAggregationType) {
  return metricType in pipelineOptions;
}

export function isPipelineAggWithMultipleBucketPaths(metricType: MetricAggregationType) {
  return !!metricAggregationConfig[metricType].supportsMultipleBucketPaths;
}
