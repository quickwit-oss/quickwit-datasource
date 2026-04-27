import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { CoreApp } from '@grafana/data';

import { ElasticDatasource } from '@/datasource';
import { ElasticsearchQuery } from '@/types';

import { QueryEditor } from '.';
import { noop } from 'lodash';

describe('QueryEditor', () => {
  it('Should NOT show Bucket Aggregations Editor if query contains a "singleMetric" metric', () => {
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: '',
      metrics: [
        {
          id: '1',
          type: 'logs',
        },
      ],
      // Even if present, this shouldn't be shown in the UI
      bucketAggs: [{ id: '2', type: 'date_histogram' }],
      filters: [],
    };

    render(<QueryEditor query={query} datasource={{} as ElasticDatasource} onChange={noop} onRunQuery={noop} />);

    expect(screen.queryByLabelText('Group By')).not.toBeInTheDocument();
  });

  it('Should show Bucket Aggregations Editor if query does NOT contains a "singleMetric" metric', () => {
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: '',
      metrics: [
        {
          id: '1',
          type: 'avg',
        },
      ],
      bucketAggs: [{ id: '2', type: 'date_histogram' }],
      filters: [],
    };

    render(<QueryEditor query={query} datasource={{} as ElasticDatasource} onChange={noop} onRunQuery={noop} />);

    expect(screen.getByText('Group By')).toBeInTheDocument();
  });

  it('normalizes exemplar-style trace links before rendering', async () => {
    const traceId = '75d7a6e5c07de26e0238cd17a281a190';
    const onChange = jest.fn();
    const query = {
      refId: 'A',
      query: traceId,
      queryType: 'traces',
      metrics: [{ id: '3', type: 'logs', settings: { limit: '100' } }],
      bucketAggs: [],
      filters: [],
    } as ElasticsearchQuery & { queryType: 'traces' };

    render(
      <QueryEditor
        query={query}
        datasource={{} as ElasticDatasource}
        onChange={onChange}
        onRunQuery={noop}
        app={CoreApp.Explore}
      />
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          query: `trace_id:${traceId}`,
          metrics: [expect.objectContaining({ id: '3', type: 'traces', settings: { limit: '100' } })],
          bucketAggs: [],
        })
      )
    );
  });
});
