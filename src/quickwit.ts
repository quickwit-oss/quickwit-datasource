import { DataSourceJsonData } from "@grafana/data";
import { DataLinkConfig } from "./types";
import { DefaultsConfigOverrides } from "store/defaults/conf";

export interface QuickwitOptions extends DataSourceJsonData {
    timeField: string;
    interval?: Interval;
    logMessageField?: string;
    logLevelField?: string;
    dataLinks?: DataLinkConfig[];
    index: string;
    queryEditorConfig?: {
        defaults?: DefaultsConfigOverrides
    }
}
