import { DataSourceSettings } from '@grafana/data';
import { QuickwitOptions } from 'quickwit';

export const coerceOptions = (
  options: DataSourceSettings<QuickwitOptions, {}>
): DataSourceSettings<QuickwitOptions, {}> => {
  return {
    ...options,
    jsonData: {
      ...options.jsonData,
      timeField: options.jsonData.timeField || 'timestamp',
      logMessageField: options.jsonData.logMessageField || '',
      logLevelField: options.jsonData.logLevelField || '',
    },
  };
};

export const isValidOptions = (options: DataSourceSettings<QuickwitOptions>): boolean => {
  return (
    // timeField should not be empty or nullish
    !!options.jsonData.timeField &&
    // maxConcurrentShardRequests should be a number AND greater than 0
    options.jsonData.logMessageField !== undefined &&
    options.jsonData.logLevelField !== undefined
  );
};
