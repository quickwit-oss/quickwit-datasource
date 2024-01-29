import React from 'react';

import { useDispatch } from '@/hooks/useStatelessReducer';
import { IconButton } from '../../IconButton';
import { useQuery } from '../ElasticsearchQueryContext';
import { QueryEditorRow } from '../QueryEditorRow';

import { MetricAggregation } from '@/types';
import { MetricEditor } from './MetricEditor';
import { addMetric, removeMetric, toggleMetricVisibility } from './state/actions';
import { metricAggregationConfig } from './utils';
import { QueryEditorSpecialMetricRow } from '../QueryEditorSpecialMetricRow';

interface Props {
  nextId: MetricAggregation['id'];
}

export const MetricAggregationsEditor = ({ nextId }: Props) => {
  const dispatch = useDispatch();
  const { metrics } = useQuery();
  const totalMetrics = metrics?.length || 0;

  return (
    <>
      {metrics?.map((metric, index) => {
        switch (metric.type) {
          case 'logs':
            return <QueryEditorSpecialMetricRow key={`${metric.type}-${metric.id}`} name="Logs" metric={metric} />;
          case 'raw_data':
            return <QueryEditorSpecialMetricRow key={`${metric.type}-${metric.id}`} name="Raw Data" metric={metric} />;
          default:
            return (
              <QueryEditorRow
                key={`${metric.type}-${metric.id}`}
                label={`Metric (${metric.id})`}
                hidden={metric.hide}
                onHideClick={() => dispatch(toggleMetricVisibility(metric.id))}
                onRemoveClick={totalMetrics > 1 && (() => dispatch(removeMetric(metric.id)))}
              >
                <MetricEditor value={metric} />

                {metricAggregationConfig[metric.type].impliedQueryType === 'metrics' && index === 0 && (
                  <IconButton iconName="plus" onClick={() => dispatch(addMetric(nextId))} label="add" />
                )}
              </QueryEditorRow>
            );
        }
      })}
    </>
  );
};
