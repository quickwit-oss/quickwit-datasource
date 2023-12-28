import React, { PropsWithChildren } from 'react';
import { from } from 'rxjs';

import { getDefaultTimeRange } from '@grafana/data';

import { ElasticsearchProvider } from '../components/QueryEditor/ElasticsearchQueryContext';
import { ElasticDatasource } from '../datasource';
import { defaultBucketAgg, defaultMetricAgg } from '../queryDef';
import { ElasticsearchQuery, MetricAggregationType, BucketAggregationType } from '../types';

import { useFields } from './useFields';
import { renderHook } from '@testing-library/react-hooks';

describe('useFields hook', () => {
  // TODO: If we move the field type to the configuration objects as described in the hook's source
  // we can stop testing for getField to be called with the correct parameters.
  it("returns a function that calls datasource's getFields with the correct parameters", async () => {
    const timeRange = getDefaultTimeRange();
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: '',
      metrics: [defaultMetricAgg()],
      bucketAggs: [defaultBucketAgg()],
    };

    const getFields: ElasticDatasource['getFields'] = jest.fn(() => from([[]]));

    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <ElasticsearchProvider
        datasource={{ getFields: getFields } as ElasticDatasource}
        query={query}
        app={undefined}
        range={timeRange}
        onChange={() => {}}
        onRunQuery={() => {}}
      >
        {children}
      </ElasticsearchProvider>
    );

    //
    // METRIC AGGREGATIONS
    //
    // Cardinality works on every kind of data
    const { result, rerender } = renderHook(
      (aggregationType: BucketAggregationType | MetricAggregationType) => useFields(aggregationType),
      // @ts-ignore
      { wrapper, initialProps: 'cardinality' }
    );
    result.current();
    expect(getFields).toHaveBeenLastCalledWith(true, [], timeRange);

    // All other metric aggregations only work on numbers
    rerender('avg');
    result.current();
    expect(getFields).toHaveBeenLastCalledWith(true, ['number'], timeRange);

    //
    // BUCKET AGGREGATIONS
    //
    // Date Histrogram only works on dates
    rerender('date_histogram');
    result.current();
    expect(getFields).toHaveBeenLastCalledWith(true, ['date'], timeRange);

    // Histrogram only works on numbers
    rerender('histogram');
    result.current();
    expect(getFields).toHaveBeenLastCalledWith(true, ['number'], timeRange);

    // Geohash Grid only works on geo_point data
    rerender('geohash_grid');
    result.current();
    expect(getFields).toHaveBeenLastCalledWith(true, ['geo_point'], timeRange);

    // All other bucket aggregation work on any kind of data
    rerender('terms');
    result.current();
    expect(getFields).toHaveBeenLastCalledWith(true, [], timeRange);

    // top_metrics work on only on numeric data in 7.7
    rerender('top_metrics');
    result.current();
    expect(getFields).toHaveBeenLastCalledWith(true, ['number'], timeRange);
  });
});
