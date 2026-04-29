import { DataSourceJsonData } from '@grafana/data';
import { DataLinkConfig } from './types';
import { DefaultsConfigOverrides } from 'store/defaults/conf';

export type FilterAutocompleteChainMode = 'none' | 'sample' | 'full';

export interface QuickwitOptions extends DataSourceJsonData {
    timeField: string;
    interval?: string;
    logMessageField?: string;
    logLevelField?: string;
    logsDatasourceUid?: string;
    logsDatasourceName?: string;
    tracesDatasourceUid?: string;
    tracesDatasourceName?: string;
    dataLinks?: DataLinkConfig[];
    index: string;
    filterAutocompleteLimit?: string;
    filterAutocompleteChainMode?: FilterAutocompleteChainMode;
    // Backward compatibility for configs created before the mode selector.
    filterAutocompleteUseFilterChains?: boolean;
    queryEditorConfig?: {
        defaults?: DefaultsConfigOverrides
    }
}
