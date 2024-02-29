import {
  BucketAggregationType,
  MetricAggregation,
  MetricAggregationType,
  MovingAverageEWMAModelSettings,
  MovingAverageHoltModelSettings,
  MovingAverageHoltWintersModelSettings,
  MovingAverageLinearModelSettings,
  MovingAverageModel,
  MovingAverageSimpleModelSettings,
  ExtendedStats,
  MovingAverage as SchemaMovingAverage,
  BucketAggregation,
  Logs as SchemaLogs,
} from './dataquery.gen';

export * from './dataquery.gen';
export { type Elasticsearch as ElasticsearchQuery } from './dataquery.gen';

// We want to extend the settings of the Logs query with additional properties that
// are not part of the schema. This is a workaround, because exporting LogsSettings
// from dataquery.gen.ts and extending that produces error in SettingKeyOf.
export enum LogsSortDirection {
  DESC = 'desc',
  ASC = 'asc',
}

export const LogsEnd = {
  [LogsSortDirection.ASC]: 'Head',
  [LogsSortDirection.DESC]: 'Tail'
}

type ExtendedLogsSettings = SchemaLogs['settings'] & {
  searchAfter?: unknown[];
  sortDirection?: LogsSortDirection;
};

export interface Logs extends SchemaLogs {
  settings?: ExtendedLogsSettings;
}

export type MetricAggregationWithMeta = ExtendedStats;

export type MovingAverageModelSettings<T extends MovingAverageModel = MovingAverageModel> = Partial<
  Extract<
    | MovingAverageSimpleModelSettings
    | MovingAverageLinearModelSettings
    | MovingAverageEWMAModelSettings
    | MovingAverageHoltModelSettings
    | MovingAverageHoltWintersModelSettings,
    { model: T }
  >
>;

export interface MovingAverage<T extends MovingAverageModel = MovingAverageModel> extends SchemaMovingAverage {
  settings?: MovingAverageModelSettings<T>;
}

export type QueryType = 'metrics' | 'logs' | 'raw_data' | 'raw_document';

export type Interval = 'Hourly' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

interface MetricConfiguration<T extends MetricAggregationType> {
  label: string;
  requiresField: boolean;
  supportsInlineScript: boolean;
  supportsMissing: boolean;
  isPipelineAgg: boolean;
  /**
   * A valid semver range for which the metric is known to be available.
   * If omitted defaults to '*'.
   */
  versionRange?: string;
  supportsMultipleBucketPaths: boolean;
  impliedQueryType: QueryType;
  hasSettings: boolean;
  hasMeta: boolean;
  defaults: Omit<Extract<MetricAggregation|Logs, { type: T }>, 'id' | 'type'>;
}

type BucketConfiguration<T extends BucketAggregationType> = {
  label: string;
  requiresField: boolean;
  defaultSettings: Extract<BucketAggregation, { type: T }>['settings'];
};

export type MetricsConfiguration = {
  [P in MetricAggregationType]: MetricConfiguration<P>;
};

export type BucketsConfiguration = {
  [P in BucketAggregationType]: BucketConfiguration<P>;
};

export interface ElasticsearchAggregation {
  id: string;
  type: MetricAggregationType | BucketAggregationType;
  settings?: unknown;
  field?: string;
  hide: boolean;
}

export interface TermsQuery {
  query?: string;
  size?: number;
  field?: string;
  order?: 'asc' | 'desc';
  orderBy?: string;
}

export type DataLinkConfig = {
  field: string;
  base64TraceId: boolean;
  url: string;
  urlDisplayLabel?: string;
  datasourceUid?: string;
};

export type FieldMapping = {
  description: string | null;
  name: string;
  type: string;
  stored: boolean | null;
  fast: boolean | null;
  indexed: boolean | null;
  // Specific datetime field attributes.
  output_format: string | null;
  field_mappings?: FieldMapping[];
}

export type IndexMetadata = {
  index_config: IndexConfig;
  checkpoint: object;
  sources: object[] | undefined;
  create_timestamp: number;
}

export type IndexConfig = {
  version: string;
  index_id: string;
  index_uri: string;
  doc_mapping: DocMapping;
  indexing_settings: object;
  search_settings: object;
  retention: object;
}

export type DocMapping = {
  field_mappings: FieldMapping[];
  tag_fields: string[];
  store: boolean;
  dynamic_mapping: boolean;
  timestamp_field: string | null;
}

export type Field = {
  // Json path (path segments concatenated as a string with dots between segments).
  json_path: string;
  // Json path of the field.
  path_segments: string[];
  field_mapping: FieldMapping;
}

export type FieldCapabilityType = "long" | "keyword" | "text" | "date" | "date_nanos" | "binary" | "double" | "boolean" | "ip" | "nested" | "object" ;

export type FieldCapability = {
  field_name: string; // Field not present in response but added on the front side.
  type: FieldCapabilityType;
  metadata_field: boolean;
  searchable: boolean;
  aggregatable: boolean;
  indices: String[];
}

export type FieldCapabilitiesResponse = {
  indices: String[];
  fields: {
    [key: string]: {
      [key in FieldCapabilityType]: FieldCapability;
    }
  };
}
