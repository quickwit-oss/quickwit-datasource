import { DataSourceSettings } from '@grafana/data';
import { QuickwitOptions } from 'quickwit';

export const coerceOptions = (
  options: DataSourceSettings<QuickwitOptions, {}>
): DataSourceSettings<QuickwitOptions, {}> => {
  const filterAutocompleteChainMode =
    options.jsonData.filterAutocompleteChainMode ??
    (options.jsonData.filterAutocompleteUseFilterChains === false ? 'none' : 'sample');

  return {
    ...options,
    jsonData: {
      ...options.jsonData,
      logMessageField: options.jsonData.logMessageField || '',
      logLevelField: options.jsonData.logLevelField || '',
      filterAutocompleteLimit: options.jsonData.filterAutocompleteLimit ?? '1000',
      filterAutocompleteChainMode,
      filterAutocompleteUseFilterChains: filterAutocompleteChainMode !== 'none',
    },
  };
};
