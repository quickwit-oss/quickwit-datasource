import React from 'react';

import { useDispatch } from '@/hooks/useStatelessReducer';
import { IconButton } from '../../IconButton';
import { useDatasource, useQuery, useRange } from '../ElasticsearchQueryContext';
import { QueryEditorRow } from '../QueryEditorRow';

import { QueryFilter } from '@/types';
import { Icon, InlineSegmentGroup, Segment, SegmentAsync, Tooltip } from '@grafana/ui';
import { AdHocVariableFilter, MetricFindValue, SelectableValue } from '@grafana/data';
import {
  addFilter,
  removeFilter,
  toggleFilterVisibility,
  changeFilterField,
  changeFilterOperation,
  changeFilterValue,
} from '@/components/QueryEditor/FilterEditor/state/actions';
import { segmentStyles } from '@/components/QueryEditor/styles';
import { newFilterId } from '@/utils/uid';
import { categorizeFieldType, filterOperations, filterOperationsFor } from '@/queryDef';
import { fuzzySearchSort, hasWhiteSpace, isSet } from '@/utils';

interface FilterEditorProps {
  onSubmit: () => void;
}

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

  if (['term', 'not term'].includes(filter.filter.operator) && filter.filter.value && hasWhiteSpace(filter.filter.value)) {
    errors.push('Term cannot have whitespace in value');
  }

  return errors;
}

function isFilterComplete(filter: QueryFilter): boolean {
  return !filter.hide && filterErrors(filter).length === 0;
}

export function getPreviousAdHocFilters(filters: QueryFilter[] | undefined, currentId: QueryFilter['id']): AdHocVariableFilter[] {
  const currentIndex = filters?.findIndex((filter) => filter.id === currentId) ?? -1;
  if (!filters || currentIndex <= 0) {
    return [];
  }

  return filters
    .slice(0, currentIndex)
    .filter(isFilterComplete)
    .map((filter) => filter.filter);
}

function toFuzzyOptions(values: MetricFindValue[], query?: string): Array<SelectableValue<string>> {
  return fuzzySearchSort(
    values.map((value) => String(value.text)),
    (text) => text,
    query
  ).map((text) => ({ label: text, value: text }));
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
  const datasource = useDatasource();
  const range = useRange();
  const { filters } = useQuery();
  const previousFilters = getPreviousAdHocFilters(filters, value.id);

  const fieldCategory = categorizeFieldType(datasource.getFieldType?.(value.filter.key));
  const visibleOperations = filterOperationsFor(fieldCategory);

  const loadFields = async (query?: string): Promise<Array<SelectableValue<string>>> => {
    const values = await datasource.getTagKeys({ filters: previousFilters, timeRange: range });
    return toFuzzyOptions(values as MetricFindValue[], query);
  };

  const loadValues = async (query?: string): Promise<Array<SelectableValue<string>>> => {
    if (!isSet(value.filter.key) || !datasource.getTagValues) {
      return [];
    }
    const values: MetricFindValue[] = await datasource.getTagValues({
      key: value.filter.key,
      filters: previousFilters,
      timeRange: range,
    });
    return toFuzzyOptions(values, query);
  };

  return (
    <>
      <InlineSegmentGroup>
        <SegmentAsync
          allowCustomValue={true}
          className={segmentStyles}
          loadOptions={loadFields}
          reloadOptionsOnChange={true}
          onChange={(e) => {
            const newKey = e.value ?? '';
            dispatch(changeFilterField({ id: value.id, field: newKey }));
            // If the currently selected operator isn't valid for the new field,
            // reset it to the first valid one so the UI stays consistent.
            const newCategory = categorizeFieldType(datasource.getFieldType?.(newKey));
            const allowed = filterOperationsFor(newCategory);
            if (!allowed.some((op) => op.value === value.filter.operator)) {
              dispatch(changeFilterOperation({ id: value.id, op: allowed[0].value }));
            }
            if (['exists', 'not exists'].includes(value.filter.operator) || isSet(value.filter.value)) {
              onSubmit();
            }
          }}
          placeholder="Select Field"
          value={value.filter.key}
        />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          <Segment
            value={filterOperations.find((op) => op.value === value.filter.operator)}
            options={visibleOperations}
            onChange={(e) => {
              let op = e.value ?? filterOperations[0].value;
              dispatch(changeFilterOperation({ id: value.id, op: op }));
              if (['exists', 'not exists'].includes(op) || isSet(value.filter.value)) {
                onSubmit();
              }
            }}
          />
          <Tooltip
            content={
              <div>
                <div><strong>is</strong> / <strong>is not</strong> — phrase match. On a <em>keyword</em> field this is exact equality; on a <em>text</em> field it matches a contiguous sequence of tokens anywhere in the value.</div>
                <div style={{ marginTop: 4 }}><strong>contains</strong> / <strong>does not contain</strong> — single-token match (no whitespace allowed). On a <em>keyword</em> field this is exact equality; on a <em>text</em> field it matches any document whose analyzed tokens include this term. Not a substring match — &ldquo;germ&rdquo; will not match &ldquo;germany&rdquo;.</div>
                <div style={{ marginTop: 4 }}><strong>&gt;</strong> / <strong>&lt;</strong> — numeric or date range. Shown only for numeric and date fields.</div>
                <div style={{ marginTop: 4 }}><strong>exists</strong> / <strong>does not exist</strong> — presence check, no value needed.</div>
              </div>
            }
            placement="top"
          >
            <Icon name="info-circle" size="xs" style={{ cursor: 'help', opacity: 0.6 }} />
          </Tooltip>
        </div>
        {!['exists', 'not exists'].includes(value.filter.operator) && (
          <SegmentAsync
            allowCustomValue={true}
            className={segmentStyles}
            loadOptions={loadValues}
            reloadOptionsOnChange={true}
            placeholder="Value"
            value={value.filter.value}
            onChange={(e) => {
              dispatch(changeFilterValue({ id: value.id, value: e.value ?? '' }));
              onSubmit();
            }}
          />
        )}
      </InlineSegmentGroup>
    </>
  );
};
