import React, { createContext, PropsWithChildren, useCallback, useEffect, useState, FunctionComponent } from 'react';

import { CoreApp, TimeRange } from '@grafana/data';

import { BaseQuickwitDataSource } from '@/datasource/base';
import { combineReducers, useStatelessReducer, DispatchContext } from '@/hooks/useStatelessReducer';
import { ElasticsearchQuery } from '@/types';

import { createReducer as createBucketAggsReducer } from './BucketAggregationsEditor/state/reducer';
import { reducer as metricsReducer } from './MetricAggregationsEditor/state/reducer';
import { aliasPatternReducer, queryReducer, initQuery, initExploreQuery } from './state';
import { getHook } from '@/utils/context';
import { Provider, useDispatch } from "react-redux";
import { initDefaults } from '@/store/defaults';
import { store } from "@/store"

export const RangeContext = createContext<TimeRange | undefined>(undefined);
export const useRange = getHook(RangeContext);

export const QueryContext = createContext<ElasticsearchQuery | undefined>(undefined);
export const useQuery = getHook(QueryContext);

export const DatasourceContext = createContext<BaseQuickwitDataSource | undefined>(undefined);
export const useDatasource = getHook(DatasourceContext);

interface Props {
  query: ElasticsearchQuery;
  app: CoreApp;
  onChange: (query: ElasticsearchQuery) => void;
  onRunQuery: () => void;
  datasource: BaseQuickwitDataSource;
  range: TimeRange;
}

function withStore<P extends PropsWithChildren<Props>>(Component: FunctionComponent<P>): FunctionComponent<P>{
  const newComp = (props: P) => (
    <Provider store={store}>
      <Component {...props}/>
    </Provider>
  )
  newComp.displayName = Component.displayName
  return newComp
}

export const ElasticsearchProvider = withStore(({
  children,
  onChange,
  onRunQuery,
  query,
  app,
  datasource,
  range,
}: PropsWithChildren<Props>): JSX.Element => {

  const storeDispatch = useDispatch();
  useEffect(()=>{
    storeDispatch(initDefaults(datasource.queryEditorConfig?.defaults))
  }, [storeDispatch, datasource])

  const onStateChange = useCallback(
    (query: ElasticsearchQuery) => {
      onChange(query);
    },
    [onChange]
  );

  const reducer = combineReducers<Pick<ElasticsearchQuery, 'query' | 'alias' | 'metrics' | 'bucketAggs'>>({
    query: queryReducer,
    alias: aliasPatternReducer,
    metrics: metricsReducer,
    bucketAggs: createBucketAggsReducer(datasource.timeField),
  });

  const dispatch = useStatelessReducer(
      // timeField is part of the query model, but its value is always set to be the one from datasource settings.
      (newState) => onStateChange({ ...query, ...newState, timeField: datasource.timeField }),
    query,
    reducer
  );

  const isUninitialized = !query.metrics || !query.bucketAggs || query.query === undefined;

  const [shouldRunInit, setShouldRunInit] = useState(isUninitialized);

  // This initializes the query by dispatching an init action to each reducer.
  // useStatelessReducer will then call `onChange` with the newly generated query
  useEffect(() => {
    if (shouldRunInit && isUninitialized) {
      if (app === CoreApp.Explore) {
        dispatch(initExploreQuery());
      } else {
        dispatch(initQuery());
      }
      setShouldRunInit(false);
    }
  }, [shouldRunInit, dispatch, isUninitialized, app]);

  if (isUninitialized) {
    return (<></>);
  }

  return (
    <DatasourceContext.Provider value={datasource}>
      <QueryContext.Provider value={query}>
        <RangeContext.Provider value={range}>
          <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
        </RangeContext.Provider>
      </QueryContext.Provider>
    </DatasourceContext.Provider>
  );
});
