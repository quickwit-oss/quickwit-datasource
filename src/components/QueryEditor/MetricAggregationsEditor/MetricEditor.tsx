import { cx } from '@emotion/css';
import React, { useCallback } from 'react';
// import { satisfies, SemVer } from 'semver';

import { SelectableValue } from '@grafana/data';
import { InlineSegmentGroup, SegmentAsync, useTheme2 } from '@grafana/ui';

import { useFields } from '../../../hooks/useFields';
import { useDispatch } from '../../../hooks/useStatelessReducer';
import { MetricAggregation, MetricAggregationType } from '../../../types';
import { MetricPicker } from '../../MetricPicker';
import { useQuery } from '../ElasticsearchQueryContext';
import { segmentStyles } from '../styles';

import { SettingsEditor } from './SettingsEditor';
import {
  isMetricAggregationWithField,
  isMetricAggregationWithInlineScript,
  isMetricAggregationWithSettings,
  isPipelineAggregation,
  isPipelineAggregationWithMultipleBucketPaths,
} from './aggregations';
import { changeMetricField, changeMetricType } from './state/actions';
import { getStyles } from './styles';
import { metricAggregationConfig } from './utils';

const toOption = (metric: MetricAggregation) => ({
  label: metricAggregationConfig[metric.type].label,
  value: metric.type,
});

interface Props {
  value: MetricAggregation;
}

const QUICKWIT_SUPPORTED_METRICS = ['count', 'avg', 'sum', 'min', 'max', 'percentiles', 'raw_data', 'logs'];

const getTypeOptions = (
  _: MetricAggregation[],
): Array<SelectableValue<MetricAggregationType>> => {
  return (
    Object.entries(metricAggregationConfig)
      .filter(([_, config]) => config.impliedQueryType === 'metrics')
      .map(([key, { label }]) => ({
        label,
        value: key as MetricAggregationType,
      }))
      .filter((option) => {
        return QUICKWIT_SUPPORTED_METRICS.includes(option.value);
      })
  );
};

export const MetricEditor = ({ value }: Props) => {
  const styles = getStyles(useTheme2(), !!value.hide);
  const query = useQuery();
  const dispatch = useDispatch();
  const getFields = useFields(value.type);

  const getTypeOptionsAsync = async (previousMetrics: MetricAggregation[]) => {
    return getTypeOptions(previousMetrics);
  };

  const loadOptions = useCallback(async () => {
    const remoteFields = await getFields();

    // Metric aggregations that have inline script support don't require a field to be set.
    if (isMetricAggregationWithInlineScript(value)) {
      return [{ label: 'None' }, ...remoteFields];
    }

    return remoteFields;
  }, [getFields, value]);

  const previousMetrics = query.metrics!.slice(
    0,
    query.metrics!.findIndex((m) => m.id === value.id)
  );

  return (
    <>
      <InlineSegmentGroup>
        <SegmentAsync
          className={cx(styles.color, segmentStyles)}
          loadOptions={() => getTypeOptionsAsync(previousMetrics)}
          onChange={(e) => dispatch(changeMetricType({ id: value.id, type: e.value! }))}
          value={toOption(value)}
        />

        {isMetricAggregationWithField(value) && !isPipelineAggregation(value) && (
          <SegmentAsync
            className={cx(styles.color, segmentStyles)}
            loadOptions={loadOptions}
            onChange={(e) => dispatch(changeMetricField({ id: value.id, field: e.value! }))}
            placeholder="Select Field"
            value={value.field}
          />
        )}

        {isPipelineAggregation(value) && !isPipelineAggregationWithMultipleBucketPaths(value) && (
          <MetricPicker
            className={cx(styles.color, segmentStyles)}
            onChange={(e) => dispatch(changeMetricField({ id: value.id, field: e.value?.id! }))}
            options={previousMetrics}
            value={value.field}
          />
        )}
      </InlineSegmentGroup>

      {isMetricAggregationWithSettings(value) && <SettingsEditor metric={value} previousMetrics={previousMetrics} />}
    </>
  );
};
