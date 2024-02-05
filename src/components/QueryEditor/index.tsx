import { css } from '@emotion/css';

import React, { createContext, useCallback, useEffect } from 'react';

import { CoreApp, Field, getDefaultTimeRange, GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { InlineLabel, useStyles2 } from '@grafana/ui';

import { ElasticDatasource } from '@/datasource';
import { useNextId } from '@/hooks/useNextId';
import { useDispatch } from '@/hooks/useStatelessReducer';
import { ElasticsearchQuery } from '@/types';

import { BucketAggregationsEditor } from './BucketAggregationsEditor';
import { ElasticsearchProvider, useDatasource } from './ElasticsearchQueryContext';
import { MetricAggregationsEditor } from './MetricAggregationsEditor';
import { metricAggregationConfig } from './MetricAggregationsEditor/utils';
import { changeQuery } from './state';
import { QuickwitOptions } from '../../quickwit';
import { QueryTypeSelector } from './QueryTypeSelector';

import { useQueryBuilder } from '@/QueryBuilder/lucene';
import { getHook } from 'utils/context';
import { LuceneQueryEditor } from '@/components/LuceneQueryEditor';
import { useDatasourceFields } from 'datasource.utils';

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
    margin: 0 ${theme.spacing(0.5)} ${theme.spacing(0.5)} 0;
  `,
  queryItem: css`
    flex-grow: 1;
  `,
});

const SearchableFieldsContext = createContext<Field[]|undefined>(undefined)
export const useSearchableFields = getHook(SearchableFieldsContext)

interface Props {
  value: ElasticsearchQuery;
}

export const ElasticSearchQueryField = ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => {
  const styles = useStyles2(getStyles);
  const builder = useQueryBuilder();
  const {setQuery} = builder;
  const datasource = useDatasource()
  const { getSuggestions } = useDatasourceFields(datasource);

  useEffect(()=>{
    setQuery(value || '')
  }, [setQuery, value])

  const onEditorChange = useCallback((query: string)=>{
    setQuery(query);
    onChange(query)
  },[setQuery, onChange])

  return (
    <div className={styles.queryItem}>
        <LuceneQueryEditor placeholder="Enter a lucene query" builder={builder} autocompleter={getSuggestions} onChange={onEditorChange}/>
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
