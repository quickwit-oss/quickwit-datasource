import React, { useRef } from 'react';

import { useDispatch } from '@/hooks/useStatelessReducer';
import { IconButton } from '../../IconButton';
import { useQuery } from '../ElasticsearchQueryContext';
import { QueryEditorRow } from '../QueryEditorRow';

import { QueryFilter } from '@/types';
import { InlineSegmentGroup, Input, Segment, SegmentAsync, Tooltip } from '@grafana/ui';
import {
  addFilter,
  removeFilter,
  toggleFilterVisibility,
  changeFilterField,
  changeFilterOperation,
  changeFilterValue,
} from '@/components/QueryEditor/FilterEditor/state/actions';
import { segmentStyles } from '@/components/QueryEditor/styles';
import { useFields } from '@/hooks/useFields';
import { newFilterId } from '@/utils/uid';
import { filterOperations } from '@/queryDef';

interface FilterEditorProps {
  onSubmit: () => void;
}

const isSet = (val: any) => val !== undefined && val !== null && val !== '';

function filterErrors(filter: QueryFilter): string[] {
  const errors: string[] = [];

  if (!isSet(filter.filter.key)) {
    errors.push('Field is not set');
  }

  if (!isSet(filter.filter.operator)) {
    errors.push('Operator is not set');
  }

  if (!['exists', 'not exists'].includes(filter.filter.operator) && !isSet(filter.filter.value)) {
    errors.push('Value is not set');
  }

  return errors;
}

export const FilterEditor = ({ onSubmit }: FilterEditorProps) => {
  const dispatch = useDispatch();
  const { filters } = useQuery();

  return (
    <>
      {filters?.map((filter, index) => {
        const errors = filterErrors(filter)
        return (
          <QueryEditorRow
            key={`${filter.id}`}
            label={errors.length > 0 ? (
              <Tooltip content={errors.join('; ')}>
                <span style={{color: "gray"}}>Filter</span>
              </Tooltip>
            ): 'Filter'}
            hidden={filter.hide}
            onHideClick={() => {
              dispatch(toggleFilterVisibility(filter.id));
              onSubmit();
            }}
            onRemoveClick={() => {
              dispatch(removeFilter(filter.id));
              onSubmit();
            }}
          >
            <FilterEditorRow value={filter} onSubmit={onSubmit} />

            {index === 0 && <IconButton
              label="add"
              iconName="plus"
              style={{marginLeft: '4px'}}
              onClick={() => dispatch(addFilter(newFilterId()))}
            />}
          </QueryEditorRow>
        )
      })}
    </>
  );
};

interface FilterEditorRowProps {
  value: QueryFilter;
  onSubmit: () => void;
}

export const FilterEditorRow = ({ value, onSubmit }: FilterEditorRowProps) => {
  const dispatch = useDispatch();
  const getFields = useFields('filters', 'startsWith');
  const valueInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <InlineSegmentGroup>
        <SegmentAsync
          allowCustomValue={true}
          className={segmentStyles}
          loadOptions={getFields}
          reloadOptionsOnChange={true}
          onChange={(e) => {
            dispatch(changeFilterField({ id: value.id, field: e.value ?? '' }));
            if (['exists', 'not exists'].includes(value.filter.operator) || isSet(value.filter.value)) {
              onSubmit();
            }
            // Auto focus the value input when a field is selected
            setTimeout(() => valueInputRef.current?.focus(), 100);
          }}
          placeholder="Select Field"
          value={value.filter.key}
        />
        <div style={{ whiteSpace: 'nowrap' }}>
          <Segment
            value={filterOperations.find((op) => op.value === value.filter.operator)}
            options={filterOperations}
            onChange={(e) => {
              let op = e.value ?? filterOperations[0].value;
              dispatch(changeFilterOperation({ id: value.id, op: op }));
              if (['exists', 'not exists'].includes(op) || isSet(value.filter.value)) {
                onSubmit();
              }
            }}
          />
        </div>
        {!['exists', 'not exists'].includes(value.filter.operator) && (
          <Input
            ref={valueInputRef}
            placeholder="Value"
            value={value.filter.value}
            onChange={(e) => dispatch(changeFilterValue({ id: value.id, value: e.currentTarget.value }))}
            onKeyUp={(e) => {
              if (e.key === 'Enter') {
                onSubmit();
              }
            }}
          />
        )}
      </InlineSegmentGroup>
    </>
  );
};
