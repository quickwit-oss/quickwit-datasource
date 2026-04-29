import React from 'react';

import { MetricFindValue, SelectableValue } from '@grafana/data';
import { InlineField, Input, SegmentAsync, Select } from '@grafana/ui';

import { useDatasource, useRange } from '@/components/QueryEditor/ElasticsearchQueryContext';
import { segmentStyles } from '@/components/QueryEditor/styles';
import { useDispatch } from '@/hooks/useStatelessReducer';
import { MetricAggregation } from '@/types';
import { fuzzySearchSort } from '@/utils';

import { changeMetricSetting } from '../state/actions';

type TraceSearchStatus = '' | 'error' | 'ok' | 'unset';

type TraceSearchSettings = Extract<MetricAggregation, { type: 'trace_search' }>['settings'] & {
  serviceName?: string;
  spanName?: string;
  status?: TraceSearchStatus;
  minDuration?: string;
  maxDuration?: string;
};

type TraceSearchMetric = Extract<MetricAggregation, { type: 'trace_search' }> & {
  settings?: TraceSearchSettings;
};

interface Props {
  metric: Extract<MetricAggregation, { type: 'trace_search' }>;
}

const statusOptions: Array<SelectableValue<TraceSearchStatus>> = [
  { label: 'Any', value: '' },
  { label: 'Error', value: 'error' },
  { label: 'Ok', value: 'ok' },
  { label: 'Unset', value: 'unset' },
];

function toFuzzyOptions(values: MetricFindValue[], query?: string): Array<SelectableValue<string>> {
  return fuzzySearchSort(
    values.map((value) => String(value.text)),
    (text) => text,
    query
  ).map((text) => ({ label: text, value: text }));
}

export const TraceSearchSettingsEditor = ({ metric }: Props) => {
  const typedMetric = metric as TraceSearchMetric;
  const dispatch = useDispatch();
  const datasource = useDatasource();
  const range = useRange();

  const changeSetting = (settingName: keyof TraceSearchSettings, newValue?: string) => {
    dispatch(changeMetricSetting({ metric: typedMetric, settingName, newValue: newValue?.trim() || undefined }));
  };

  const loadFieldValues = (field: string) => async (query?: string): Promise<Array<SelectableValue<string>>> => {
    if (!datasource.getTagValues) {
      return [];
    }
    const values = await datasource.getTagValues({ key: field, timeRange: range });
    return toFuzzyOptions(values, query);
  };

  return (
    <>
      <InlineField label="Service name" labelWidth={16}>
        <SegmentAsync
          allowCustomValue={true}
          className={segmentStyles}
          loadOptions={loadFieldValues('service_name')}
          onChange={(e) => changeSetting('serviceName', e.value)}
          placeholder="All services"
          value={typedMetric.settings?.serviceName}
        />
      </InlineField>
      <InlineField label="Span name" labelWidth={16}>
        <SegmentAsync
          allowCustomValue={true}
          className={segmentStyles}
          loadOptions={loadFieldValues('span_name')}
          onChange={(e) => changeSetting('spanName', e.value)}
          placeholder="All spans"
          value={typedMetric.settings?.spanName}
        />
      </InlineField>
      <InlineField label="Status" labelWidth={16}>
        <Select
          onChange={(e) => changeSetting('status', e.value)}
          options={statusOptions}
          value={typedMetric.settings?.status || ''}
        />
      </InlineField>
      <InlineField label="Min duration" labelWidth={16}>
        <Input
          id={`ES-query-trace-search-${metric.id}-min-duration`}
          onBlur={(e) => changeSetting('minDuration', e.target.value)}
          defaultValue={typedMetric.settings?.minDuration}
          placeholder="100ms"
        />
      </InlineField>
      <InlineField label="Max duration" labelWidth={16}>
        <Input
          id={`ES-query-trace-search-${metric.id}-max-duration`}
          onBlur={(e) => changeSetting('maxDuration', e.target.value)}
          defaultValue={typedMetric.settings?.maxDuration}
          placeholder="1.2s"
        />
      </InlineField>
    </>
  );
};
