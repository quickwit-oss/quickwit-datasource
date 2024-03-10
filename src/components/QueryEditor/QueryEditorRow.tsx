import { css } from '@emotion/css';
import { noop } from 'lodash';
import React, { PropsWithChildren, ReactNode } from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { IconButton, InlineFieldRow, InlineLabel, InlineSegmentGroup, useStyles2 } from '@grafana/ui';

const getStyles = (theme: GrafanaTheme2) => {
  return {
    iconWrapper: css`
      display: flex;
    `,
    icon: css`
      color: ${theme.colors.text.secondary};
      margin-left: ${theme.spacing(0.25)};
    `,
  };
};

interface BaseRowProps { label: ReactNode; };
export const QueryEditorBaseRow = ({ label, children }: PropsWithChildren<BaseRowProps>) => {
  return (
    <InlineFieldRow>
      <InlineSegmentGroup>
        <InlineLabel width={17} as="div">
          {label}
        </InlineLabel>
      </InlineSegmentGroup>
      {children}
    </InlineFieldRow>
  );
};

interface RowProps extends BaseRowProps {
  onRemoveClick?: false | (() => void);
  onHideClick?: false | (() => void);
  hidden?: boolean;
}
export const QueryEditorRow = ({
  children,
  label,
  onRemoveClick,
  onHideClick,
  hidden = false,
}: PropsWithChildren<RowProps>) => {
  const styles = useStyles2(getStyles);

  return (
    <QueryEditorBaseRow label={(<>
        <span>{label}</span>
        <span className={styles.iconWrapper}>
          {onHideClick && (
            <IconButton
              name={hidden ? 'eye-slash' : 'eye'}
              onClick={onHideClick}
              size="sm"
              aria-pressed={hidden}
              aria-label="hide metric"
              className={styles.icon}
              type="button"
            />
          )}
          <IconButton
            name="trash-alt"
            size="sm"
            className={styles.icon}
            onClick={onRemoveClick || noop}
            disabled={!onRemoveClick}
            aria-label="remove metric"
            type="button"
          />
        </span>
      </>)}>
      {children}
    </QueryEditorBaseRow>
  );
};


