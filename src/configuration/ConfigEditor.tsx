import React, { useCallback } from 'react';
import { DataSourceHttpSettings, Input, InlineField, FieldSet } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, DataSourceSettings } from '@grafana/data';
import { QuickwitOptions } from 'quickwit';
import { coerceOptions } from './utils';
import { Divider } from 'components/Divider';
import { DataLinks } from './DataLinks';

interface Props extends DataSourcePluginOptionsEditorProps<QuickwitOptions> {}

export const ConfigEditor = (props: Props) => {
  const { options: originalOptions, onOptionsChange } = props;
  const options = coerceOptions(originalOptions);
  const onSettingsChange = useCallback(
    (change: Partial<DataSourceSettings<any, any>>) => {
      onOptionsChange({
        ...options,
        ...change,
      });
    },
    [options, onOptionsChange]
  );

  return (
    <>
      <DataSourceHttpSettings
        defaultUrl="http://localhost:7280/api/v1"
        dataSourceConfig={options}
        onChange={onOptionsChange}
      />
      <QuickwitDetails value={options} onChange={onSettingsChange} />
      <QuickwitDataLinks value={options} onChange={onOptionsChange} />
    </>
  );
};

type DetailsProps = {
  value: DataSourceSettings<QuickwitOptions>;
  onChange: (value: DataSourceSettings<QuickwitOptions>) => void;
};

export const QuickwitDataLinks = ({ value, onChange }: DetailsProps) => {
  return (
    <div className="gf-form-group">
      <Divider hideLine />
      <DataLinks
        value={value.jsonData.dataLinks}
        onChange={(newValue) => {
          onChange({
            ...value,
            jsonData: {
              ...value.jsonData,
              dataLinks: newValue,
            },
          });
        }}
      />
    </div>
  )
};

export const QuickwitDetails = ({ value, onChange }: DetailsProps) => {
  return (
    <>
      <div className="gf-form-group">
        <FieldSet label="Index settings">
          <InlineField label="Index ID" labelWidth={26} tooltip="Index ID. Required.">
            <Input
              id="quickwit_index_id"
              value={value.jsonData.index}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, index: event.currentTarget.value}})}
              placeholder="otel-logs-v0"
              width={40}
            />
          </InlineField>
          <InlineField label="Message field name" labelWidth={26} tooltip="Field used to display a log line in the Explore view">
            <Input
              id="quickwit_log_message_field"
              value={value.jsonData.logMessageField}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, logMessageField: event.currentTarget.value}})}
              placeholder="body.message"
              width={40}
            />
          </InlineField>
          <InlineField label="Log level field" labelWidth={26} tooltip="The log level field must be a fast field">
            <Input
              id="quickwit_log_level_field"
              value={value.jsonData.logLevelField}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, logLevelField: event.currentTarget.value}})}
              placeholder="level"
              width={40}
            />
          </InlineField>
        </FieldSet>
      </div>
    </>
  );
};
