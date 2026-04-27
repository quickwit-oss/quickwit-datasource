import { MetricAggregation, MetricAggregationType, Logs as SchemaLogs } from '@/dataquery.gen';
import { Logs, LogsSortDirection } from '@/types';

export type QuickwitMetricAggregationType = Extract<
  'count' | 'avg' | 'sum' | 'min' | 'max' | 'percentiles' | 'raw_data' | 'logs' | 'traces' | 'trace_search',
  MetricAggregationType
>;

export type MetricsDefaultSettings = Partial<{
  [T in QuickwitMetricAggregationType]: Omit<
    Extract<Exclude<MetricAggregation, SchemaLogs> | Logs, { type: T }>,
    'id' | 'type'
  >;
}>;

export const defaultMetricAggregationConfig: MetricsDefaultSettings = {
  percentiles: {
    settings: {
      percents: ['25', '50', '75', '95', '99'],
    },
  },
  raw_data: {
    settings: {
      size: '100',
    },
  },
  logs: {
    settings: {
      limit: '100',
      sortDirection: 'desc' as LogsSortDirection,
    },
  },
  traces: {
    settings: {
      limit: '1000',
    },
  },
  trace_search: {
    settings: {
      limit: '20',
      spanLimit: '5000',
    },
  },
};

export const defaultConfig = {
  metricAggregation: defaultMetricAggregationConfig,
};

export type DefaultsConfig = typeof defaultConfig;

export type DefaultsConfigOverrides = { [key: string]: any };
