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

export type FilterFieldCategory = 'text' | 'keyword' | 'number' | 'date' | 'boolean' | 'other';

export interface FilterOperation {
  label: string;
  value: string;
  // Field categories this operation applies to. Undefined = always available.
  types?: FilterFieldCategory[];
}

export const filterOperations: FilterOperation[] = [
  { label: 'is', value: '=' },
  { label: 'is not', value: '!=' },
  { label: 'contains', value: 'term', types: ['text'] },
  { label: 'does not contain', value: 'not term', types: ['text'] },
  { label: '>', value: '>', types: ['number', 'date'] },
  { label: '<', value: '<', types: ['number', 'date'] },
  { label: 'exists', value: 'exists' },
  { label: 'does not exist', value: 'not exists' },
];

/**
 * Map a Quickwit/Elasticsearch raw field type (as returned by _field_caps) to
 * a coarser category used to decide which operators to expose in the filter UI.
 */
export function categorizeFieldType(rawType?: string): FilterFieldCategory {
  if (!rawType) {return 'other';}
  if (rawType === 'text') {return 'text';}
  if (rawType === 'keyword') {return 'keyword';}
  if (['long', 'integer', 'int', 'short', 'byte', 'double', 'float', 'scaled_float', 'half_float', 'unsigned_long'].includes(rawType)) {return 'number';}
  if (['date', 'date_nanos'].includes(rawType)) {return 'date';}
  if (rawType === 'boolean' || rawType === 'bool') {return 'boolean';}
  return 'other';
}

/**
 * Operations available for a given field category. When the category is 'other'
 * (unknown field) we return everything so the user still has full control.
 */
export function filterOperationsFor(category: FilterFieldCategory): FilterOperation[] {
  if (category === 'other') {return filterOperations;}
  return filterOperations.filter((op) => !op.types || op.types.includes(category));
}

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
