import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { PropsWithChildren } from 'react';
import { from } from 'rxjs';

import { CoreApp, getDefaultTimeRange } from '@grafana/data';

import { ElasticDatasource } from '../../../datasource';
import { defaultBucketAgg } from '../../../queryDef';
import { ElasticsearchQuery } from '../../../types';
import { ElasticsearchProvider } from '../ElasticsearchQueryContext';

import { Count, UniqueCount } from './../../../types';
import { MetricEditor } from './MetricEditor';

describe('Metric Editor', () => {
  it('Should not display a "None" option for "field" if the metric does not support inline script', async () => {
    const avg: UniqueCount = {
      id: '1',
      type: 'cardinality',
    };

    const query: ElasticsearchQuery = {
      refId: 'A',
      query: '',
      metrics: [avg],
      bucketAggs: [defaultBucketAgg('2')],
    };

    const getFields: ElasticDatasource['getFields'] = jest.fn(() => from([[]]));

    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <ElasticsearchProvider
        datasource={{ getFields: getFields } as ElasticDatasource}
        query={query}
        app={CoreApp.Unknown}
        range={getDefaultTimeRange()}
        onChange={() => {}}
        onRunQuery={() => {}}
      >
        {children}
      </ElasticsearchProvider>
    );

    render(<MetricEditor value={avg} />, { wrapper });

    act(() => {
      fireEvent.click(screen.getByText('Select Field'));
    });

    expect(await screen.findByText('No options found')).toBeInTheDocument();
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  it('Should not list special metrics', async () => {
    const count: Count = {
      id: '1',
      type: 'count',
    };

    const query: ElasticsearchQuery = {
      refId: 'A',
      query: '',
      metrics: [count],
      bucketAggs: [],
    };

    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <ElasticsearchProvider
        datasource={{} as ElasticDatasource}
        query={query}
        app={CoreApp.Explore}
        range={getDefaultTimeRange()}
        onChange={() => {}}
        onRunQuery={() => {}}
      >
        {children}
      </ElasticsearchProvider>
    );

    render(<MetricEditor value={count} />, { wrapper });

    act(() => {
      userEvent.click(screen.getByText('Count'));
    });

    // we check if the list-of-options is visible by
    // checking for an item to exist
    expect(await screen.findByText('Percentiles')).toBeInTheDocument();

    // now we make sure the should-not-be-shown items are not shown
    expect(screen.queryByText('Logs')).toBeNull();
    expect(screen.queryByText('Raw Data')).toBeNull();
  });
});
