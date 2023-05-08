import { DataSourceJsonData } from "@grafana/data";
import { DataLinkConfig } from "types";

export interface QuickwitOptions extends DataSourceJsonData {
    timeField: string;
    interval?: Interval;
    timeInterval: string;
    logMessageField?: string;
    logLevelField?: string;
    dataLinks?: DataLinkConfig[];
    index: string;
}

export interface LogRowContextOptions {
direction?: LogRowContextQueryDirection;
limit?: number;
}

export enum LogRowContextQueryDirection {
    Backward = 'BACKWARD',
    Forward = 'FORWARD',
}
