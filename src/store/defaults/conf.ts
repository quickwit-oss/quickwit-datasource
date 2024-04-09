import {
  MetricAggregation,
  MetricAggregationType,
  Logs as SchemaLogs,
  } from '@/dataquery.gen';
import { Logs, LogsSortDirection } from "@/types";

export type QuickwitMetricAggregationType  = Extract<'count' | 'avg' | 'sum' | 'min' | 'max'  | 'percentiles'  | 'raw_data' | 'logs', MetricAggregationType >

export type MetricsDefaultSettings = Partial<{
  [T in QuickwitMetricAggregationType]: Omit<Extract<Exclude<MetricAggregation,SchemaLogs>|Logs, { type: T }>, 'id' | 'type'>;
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
      sortDirection:'desc' as LogsSortDirection
    },
  },
};

export const defaultConfig = {
  metricAggregation: defaultMetricAggregationConfig
};

export type DefaultsConfig = typeof defaultConfig

export type DefaultsConfigOverrides = {[key: string]: any};
