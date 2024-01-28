import { DataSourceInstanceSettings, PluginType } from '@grafana/data';

import { QuickwitDataSource } from './datasource';
import { QuickwitOptions } from './quickwit';

export function createElasticDatasource(
  settings: Partial<DataSourceInstanceSettings<QuickwitOptions>> = {},
) {
  const { jsonData, ...rest } = settings;

  const instanceSettings: DataSourceInstanceSettings<QuickwitOptions> = {
    id: 1,
    meta: {
      id: 'id',
      name: 'name',
      type: PluginType.datasource,
      module: '',
      baseUrl: '',
      info: {
        author: {
          name: 'Test',
        },
        description: '',
        links: [],
        logos: {
          large: '',
          small: '',
        },
        screenshots: [],
        updated: '',
        version: '',
      },
    },
    readOnly: false,
    name: 'test-quickwit',
    type: 'type',
    uid: 'uid',
    access: 'proxy',
    url: '',
    jsonData: {
      timeField: '',
      timeOutputFormat: '',
      index: '',
      ...jsonData,
    },
    database: 'myindex',
    ...rest,
  };

  return new QuickwitDataSource(instanceSettings);
}
