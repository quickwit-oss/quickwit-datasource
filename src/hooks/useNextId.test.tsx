import React, { PropsWithChildren } from 'react';

import { CoreApp, getDefaultTimeRange } from '@grafana/data';

import { ElasticsearchProvider } from '../components/QueryEditor/ElasticsearchQueryContext';
import { ElasticDatasource } from '../datasource';
import { ElasticsearchQuery } from '../types';

import { useNextId } from './useNextId';
import { renderHook } from '@testing-library/react-hooks';

describe('useNextId', () => {
  it('Should return the next available id', () => {
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: '',
      metrics: [{ id: '1', type: 'avg' }],
      bucketAggs: [{ id: '2', type: 'date_histogram' }],
    };
    const wrapper = ({ children }: PropsWithChildren<{}>) => {
      return (
        <ElasticsearchProvider
          query={query}
          app={CoreApp.Explore}
          datasource={{} as ElasticDatasource}
          onChange={() => {}}
          onRunQuery={() => {}}
          range={getDefaultTimeRange()}
        >
          {children}
        </ElasticsearchProvider>
      );
    };

    const { result } = renderHook(() => useNextId(), {
      wrapper,
    });

    expect(result.current).toBe('3');
  });
});
