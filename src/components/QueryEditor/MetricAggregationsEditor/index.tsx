import React from 'react';

import { useDispatch } from '@/hooks/useStatelessReducer';
import { IconButton } from '../../IconButton';
import { useQuery } from '../ElasticsearchQueryContext';
import { QueryEditorRow, QueryEditorBaseRow } from '../QueryEditorRow';

import { MetricAggregation } from '@/types';
import { MetricEditor } from './MetricEditor';
import { addMetric, removeMetric, toggleMetricVisibility } from './state/actions';
import { metricAggregationConfig } from './utils';
import { SettingsEditor } from './SettingsEditor';

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
            return <QueryEditorBaseRow key={`${metric.type}-${metric.id}`} label="Logs">
                <SettingsEditor metric={metric} previousMetrics={[]} />
              </QueryEditorBaseRow>;
          case 'raw_data':
            return <QueryEditorBaseRow key={`${metric.type}-${metric.id}`} label="Raw Data">
                <SettingsEditor metric={metric} previousMetrics={[]} />
              </QueryEditorBaseRow>;
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
