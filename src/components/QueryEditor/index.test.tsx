import { render, screen } from '@testing-library/react';
import React from 'react';

import { ElasticDatasource } from '../../datasource';
import { ElasticsearchQuery } from '../../types';

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
    };

    render(<QueryEditor query={query} datasource={{} as ElasticDatasource} onChange={noop} onRunQuery={noop} />);

    expect(screen.getByText('Group By')).toBeInTheDocument();
  });
});
