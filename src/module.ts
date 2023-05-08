import { DataSourcePlugin } from '@grafana/data';
import { QuickwitDataSource } from './datasource';
import { ConfigEditor } from './configuration/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { ElasticsearchQuery } from 'types';
import { QuickwitOptions } from 'quickwit';

export const plugin = new DataSourcePlugin<QuickwitDataSource, ElasticsearchQuery, QuickwitOptions>(QuickwitDataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
