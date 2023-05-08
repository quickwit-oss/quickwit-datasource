import React from 'react';
import { css } from '@emotion/css';
import { Button, useStyles } from '@grafana/ui';
import { GrafanaTheme, VariableOrigin, DataLinkBuiltInVars } from '@grafana/data';
import { DataLinkConfig } from '../types';
import { DataLink } from './DataLink';

const getStyles = (theme: GrafanaTheme) => ({
  infoText: css`
    padding-bottom: ${theme.spacing.md};
    color: ${theme.colors.textWeak};
  `,
  dataLink: css`
    margin-bottom: ${theme.spacing.sm};
  `,
});

type Props = {
  value?: DataLinkConfig[];
  onChange: (value: DataLinkConfig[]) => void;
};
export const DataLinks = (props: Props) => {
  const { value, onChange } = props;
  const styles = useStyles(getStyles);

  return (
    <>
      <h3 className="page-heading">Data links</h3>

      <div className={styles.infoText}>
        Add links to existing fields. Links will be shown in log row details next to the field value.
      </div>

      {value && value.length > 0 && (
        <div className="gf-form-group">
          {value.map((field, index) => {
            return (
              <DataLink
                className={styles.dataLink}
                key={index}
                value={field}
                onChange={(newField) => {
                  const newDataLinks = [...value];
                  newDataLinks.splice(index, 1, newField);
                  onChange(newDataLinks);
                }}
                onDelete={() => {
                  const newDataLinks = [...value];
                  newDataLinks.splice(index, 1);
                  onChange(newDataLinks);
                }}
                suggestions={[
                  {
                    value: DataLinkBuiltInVars.valueRaw,
                    label: 'Raw value',
                    documentation: 'Raw value of the field',
                    origin: VariableOrigin.Value,
                  },
                ]}
              />
            );
          })}
        </div>
      )}

      <Button
        variant={'secondary'}
        className={css`
          margin-right: 10px;
        `}
        icon="plus"
        onClick={(event) => {
          event.preventDefault();
          const newDataLinks = [...(value || []), { field: '', url: '' }];
          onChange(newDataLinks);
        }}
      >
        Add
      </Button>
    </>
  );
};
