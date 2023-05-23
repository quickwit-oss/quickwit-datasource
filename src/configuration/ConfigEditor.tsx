import React, { useCallback } from 'react';
import { Input, InlineField, FieldSet, useTheme2 } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, DataSourceSettings } from '@grafana/data';
import { QuickwitOptions } from 'quickwit';
import { coerceOptions } from './utils';
import { selectors } from '@grafana/e2e-selectors';
import { css, cx } from '@emotion/css';

interface Props extends DataSourcePluginOptionsEditorProps<QuickwitOptions> {}

export const ConfigEditor = (props: Props) => {
  const { options: originalOptions, onOptionsChange } = props;
  const options = coerceOptions(originalOptions);
  const theme = useTheme2();
  const isValidUrl = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/.test(
    options.url
  );
  const notValidStyle = css`
    box-shadow: inset 0 0px 5px ${theme.v1.palette.red};
  `;

  const inputStyle = cx({ [`width-20`]: true, [notValidStyle]: !isValidUrl });
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
      <h3 className="page-heading">HTTP</h3>
      <div className="gf-form-group">
        <div className="gf-form">
          <div>
            <InlineField label="URL" labelWidth={26} tooltip="Quickwit API URL">
              <Input
                className={inputStyle}
                placeholder="http://localhost:7280/api/v1"
                value={options.url}
                aria-label={selectors.components.DataSource.DataSourceHttpSettings.urlInput}
                onChange={(value) => onSettingsChange({ url: value.currentTarget.value })}
              />
            </InlineField>
          </div>
        </div>
      </div>
      <QuickwitDetails value={options} onChange={onSettingsChange} />
    </>
  );
};

type DetailsProps = {
  value: DataSourceSettings<QuickwitOptions>;
  onChange: (value: DataSourceSettings<QuickwitOptions>) => void;
};
export const QuickwitDetails = ({ value, onChange }: DetailsProps) => {
  return (
    <>
      <div className="gf-form-group">
        <FieldSet label="Index settings">
          <InlineField label="Index ID" labelWidth={26} tooltip="Index ID">
            <Input
              id="quickwit_index_id"
              value={value.jsonData.index}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, index: event.currentTarget.value}})}
              placeholder="otel-logs-v0"
              width={40}
            />
          </InlineField>
          <InlineField label="Timestamp field" labelWidth={26} tooltip="">
            <Input
              id="quickwit_index_timestamp_field"
              value={value.jsonData.timeField}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, timeField: event.currentTarget.value}})}
              placeholder="timestamp"
              width={40}
            />
          </InlineField>
          <InlineField label="Timestamp field output format" labelWidth={26} tooltip="">
            <Input
              id="quickwit_index_timestamp_field_output_format"
              value={value.jsonData.timeOutputFormat}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, timeOutputFormat: event.currentTarget.value}})}
              placeholder="unix_timestamp_millisecs"
              width={40}
            />
          </InlineField>
          <InlineField label="Message field name" labelWidth={26} tooltip="">
            <Input
              id="quickwit_log_message_field"
              value={value.jsonData.logMessageField}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, logMessageField: event.currentTarget.value}})}
              placeholder="_source"
              width={40}
            />
          </InlineField>
          <InlineField label="Log level field" labelWidth={26} tooltip="">
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
