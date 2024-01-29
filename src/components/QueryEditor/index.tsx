import { css } from '@emotion/css';

import React from 'react';

import { CoreApp, getDefaultTimeRange, GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { InlineLabel, QueryField, useStyles2 } from '@grafana/ui';

import { ElasticDatasource } from '@/datasource';
import { useNextId } from '@/hooks/useNextId';
import { useDispatch } from '@/hooks/useStatelessReducer';
import { ElasticsearchQuery } from '@/types';

import { BucketAggregationsEditor } from './BucketAggregationsEditor';
import { ElasticsearchProvider } from './ElasticsearchQueryContext';
import { MetricAggregationsEditor } from './MetricAggregationsEditor';
import { metricAggregationConfig } from './MetricAggregationsEditor/utils';
import { changeQuery } from './state';
import { QuickwitOptions } from '../../quickwit';
import { QueryTypeSelector } from './QueryTypeSelector';

export type ElasticQueryEditorProps = QueryEditorProps<ElasticDatasource, ElasticsearchQuery, QuickwitOptions>;

export const QueryEditor = ({ query, onChange, onRunQuery, datasource, range, app }: ElasticQueryEditorProps) => {
  return (
    <ElasticsearchProvider
      datasource={datasource}
      onChange={onChange}
      app={app || CoreApp.Unknown}
      onRunQuery={onRunQuery}
      query={query}
      range={range || getDefaultTimeRange()}
    >
      <QueryEditorForm value={query} />
    </ElasticsearchProvider>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  root: css`
    display: flex;
  `,
  queryItem: css`
    flex-grow: 1;
    margin: 0 ${theme.spacing(0.5)} ${theme.spacing(0.5)} 0;
  `,
});

interface Props {
  value: ElasticsearchQuery;
}

export const ElasticSearchQueryField = ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.queryItem}>
      <QueryField
        query={value}
        // By default QueryField calls onChange if onBlur is not defined, this will trigger a rerender
        // And slate will claim the focus, making it impossible to leave the field.
        onBlur={() => {}}
        onChange={onChange}
        placeholder="Enter a lucene query"
        portalOrigin="elasticsearch"
      />
    </div>
  );
};

const QueryEditorForm = ({ value }: Props) => {
  const dispatch = useDispatch();
  const nextId = useNextId();
  const styles = useStyles2(getStyles);

  const showBucketAggregationsEditor = value.metrics?.every(
    (metric) => metricAggregationConfig[metric.type].impliedQueryType === 'metrics'
  );

  return (
    <>
      <div className={styles.root}>
        <InlineLabel width={17}>Query type</InlineLabel>
        <div className={styles.queryItem}>
          <QueryTypeSelector />
        </div>
      </div>
      <div className={styles.root}>
        <InlineLabel width={17}>Lucene Query</InlineLabel>
        <ElasticSearchQueryField onChange={(query) => dispatch(changeQuery(query))} value={value?.query} />
      </div>

      <MetricAggregationsEditor nextId={nextId} />
      {showBucketAggregationsEditor && <BucketAggregationsEditor nextId={nextId} />}
    </>
  );
};
