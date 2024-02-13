import { DataSourceSettings } from '@grafana/data';
import { createDatasourceSettings } from '../dependencies/mocks';
import { QuickwitOptions } from 'quickwit';

export function createDefaultConfigOptions(): DataSourceSettings<QuickwitOptions> {
  return createDatasourceSettings<QuickwitOptions>({
    logMessageField: 'test.message',
    logLevelField: 'test.level',
    index: 'test',
  });
}
