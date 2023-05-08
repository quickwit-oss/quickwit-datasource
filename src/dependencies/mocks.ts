import { DataSourceJsonData, DataSourceSettings } from '@grafana/data';

export function createDatasourceSettings<T extends DataSourceJsonData>(jsonData: T): DataSourceSettings<T> {
  return {
    id: 0,
    uid: 'test',
    orgId: 0,
    name: 'datasource-test',
    typeLogoUrl: '',
    type: 'datasource',
    typeName: 'Datasource',
    access: 'server',
    url: 'http://localhost',
    user: '',
    database: '',
    basicAuth: false,
    basicAuthUser: '',
    isDefault: false,
    jsonData,
    readOnly: false,
    withCredentials: false,
    secureJsonFields: {},
  };
}
