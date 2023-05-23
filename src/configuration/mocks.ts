import { DataSourceSettings } from '@grafana/data';
import { createDatasourceSettings } from '../dependencies/mocks';
import { QuickwitOptions } from 'quickwit';

export function createDefaultConfigOptions(): DataSourceSettings<QuickwitOptions> {
  return createDatasourceSettings<QuickwitOptions>({
    timeField: 'timestamp',
    timeOutputFormat: 'unix_timestamp_millisecs',
    logMessageField: 'test.message',
    logLevelField: 'test.level',
    index: 'test',
  });
}
