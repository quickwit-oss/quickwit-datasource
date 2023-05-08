import React, { useEffect } from 'react';
import { Input, InlineField, FieldSet, DataSourceHttpSettings } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, DataSourceSettings } from '@grafana/data';
import { QuickwitOptions } from 'quickwit';
import { coerceOptions, isValidOptions } from './utils';

interface Props extends DataSourcePluginOptionsEditorProps<QuickwitOptions> {}

export const ConfigEditor = (props: Props) => {
  const { options: originalOptions, onOptionsChange } = props;
  const options = coerceOptions(originalOptions);
  options.access = 'proxy';

  useEffect(() => {
    if (!isValidOptions(originalOptions)) {
      onOptionsChange(coerceOptions(originalOptions));
    }

    // We can't enforce the eslint rule here because we only want to run this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <DataSourceHttpSettings
        defaultUrl="http://localhost:7280"
        dataSourceConfig={options}
        showAccessOptions={false}
        sigV4AuthToggleEnabled={false}
        onChange={onOptionsChange}
      />
      <QuickwitDetails value={options} onChange={onOptionsChange} />
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
              onChange={indexChangeHandler(value, onChange)}
              placeholder="otel-logs-v0"
              width={40}
            />
          </InlineField>
          <InlineField label="Timestamp field" labelWidth={26} tooltip="">
            <Input
              id="quickwit_index_timestamp_field"
              value={value.jsonData.timeField}
              onChange={jsonDataChangeHandler('timeField', value, onChange)}
              placeholder="timestamp"
              width={40}
            />
          </InlineField>
          <InlineField label="Log level field" labelWidth={26} tooltip="">
            <Input
              id="quickwit_log_level_field"
              value={value.jsonData.logLevelField}
              onChange={jsonDataChangeHandler('logLevelField', value, onChange)}
              placeholder="severity_text"
              width={40}
            />
          </InlineField>
        </FieldSet>
      </div>
    </>
  );
};

const indexChangeHandler =
  (value: DetailsProps['value'], onChange: DetailsProps['onChange']) =>
  (event: React.SyntheticEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange({
      ...value,
      database: '',
      jsonData: {
        ...value.jsonData,
        index: event.currentTarget.value,
      },
    });
  };

// TODO: Use change handlers from @grafana/data
const jsonDataChangeHandler =
  (key: keyof QuickwitOptions, value: DetailsProps['value'], onChange: DetailsProps['onChange']) =>
  (event: React.SyntheticEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange({
      ...value,
      jsonData: {
        ...value.jsonData,
        [key]: event.currentTarget.value,
      },
    });
  };
