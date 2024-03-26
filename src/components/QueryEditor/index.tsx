import { css } from '@emotion/css';

import React, { createContext } from 'react';
import { debounceTime, throttleTime } from 'rxjs';
import { useObservableCallback, useSubscription } from 'observable-hooks'

import { CoreApp, Field, getDefaultTimeRange, GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { InlineLabel, useStyles2 } from '@grafana/ui';

import { ElasticDatasource } from '@/datasource';
import { useNextId } from '@/hooks/useNextId';
import { useDispatch } from '@/hooks/useStatelessReducer';
import { ElasticsearchQuery } from '@/types';

import { BucketAggregationsEditor } from './BucketAggregationsEditor';
import { ElasticsearchProvider, useDatasource, useRange } from './ElasticsearchQueryContext';
import { MetricAggregationsEditor } from './MetricAggregationsEditor';
import { metricAggregationConfig } from './MetricAggregationsEditor/utils';
import { changeQuery } from './state';
import { QuickwitOptions } from '../../quickwit';
import { QueryTypeSelector } from './QueryTypeSelector';

import { getHook } from '@/utils/context';
import { LuceneQueryEditor } from '@/components/LuceneQueryEditor';
import { useDatasourceFields } from '@/datasource/utils';

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
      <QueryEditorForm value={query} onRunQuery={onRunQuery} />
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
  onRunQuery: () => void
}

type ElasticSearchQueryFieldProps = {
  value?: string;
  onChange: (v: string) => void
  onSubmit: (v: string) => void
}
export const ElasticSearchQueryField = ({ value, onChange, onSubmit }: ElasticSearchQueryFieldProps) => {
  const styles = useStyles2(getStyles);
  const datasource = useDatasource()
  const range = useRange();
  const { getSuggestions } = useDatasourceFields(datasource, range);

  return (
    <div className={styles.queryItem}>
      <LuceneQueryEditor 
        placeholder="Enter a lucene query - Type Shift-Enter to run query, Ctrl-Space to autocomplete"
        value={value || ''}
        autocompleter={getSuggestions}
        onChange={onChange}
        onSubmit={onSubmit}
        />
    </div>
  );
};

const QueryEditorForm = ({ value, onRunQuery }: Props) => {
  const dispatch = useDispatch();
  const nextId = useNextId();
  const styles = useStyles2(getStyles);

  const showBucketAggregationsEditor = value.metrics?.every(
    (metric) => metricAggregationConfig[metric.type].impliedQueryType === 'metrics'
  );

  const onChange = (query: string) => {
    dispatch(changeQuery(query))
  }
  const onSubmit = (query: string) => {
    onChange(query)
    onRunQuery()
  }

  const [onChangeCB, textChanged$] = useObservableCallback<string>(event$ => event$.pipe(debounceTime(1000)))
  const [onSubmitCB, submitted$] = useObservableCallback<string>(event$=>event$.pipe(throttleTime(500)))

  useSubscription(textChanged$, onChange)
  useSubscription(submitted$, onSubmit)

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
        <ElasticSearchQueryField
          onChange={onChangeCB}
          value={value?.query}
          onSubmit={onSubmitCB}/>
      </div>

      <MetricAggregationsEditor nextId={nextId} />
      {showBucketAggregationsEditor && <BucketAggregationsEditor nextId={nextId} />}
    </>
  );
};
