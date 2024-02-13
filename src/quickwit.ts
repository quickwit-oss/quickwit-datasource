import { DataSourceJsonData } from "@grafana/data";
import { DataLinkConfig } from "./types";

export interface QuickwitOptions extends DataSourceJsonData {
    interval?: Interval;
    logMessageField?: string;
    logLevelField?: string;
    dataLinks?: DataLinkConfig[];
    index: string;
}
