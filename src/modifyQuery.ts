import { escapeFilter, escapeFilterValue, concatenate, LuceneQuery } from 'utils/lucene';
import { AdHocVariableFilter } from '@grafana/data';

type FilterArrayElement = string | number | boolean;

function isFilterArrayElement(value: unknown): value is FilterArrayElement {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function tryParseJsonArray(value: string): FilterArrayElement[] | null {
  if (!value.trimStart().startsWith('[')) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every(isFilterArrayElement)) {
      return parsed;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

function formatArrayElement(value: FilterArrayElement) {
  if (typeof value === 'string') {
    return `"${escapeFilterValue(value)}"`;
  }
  return String(value);
}

function hasFilterValue(value: unknown) {
  return value !== undefined && value !== null && String(value) !== '';
}

function isLiteralValue(value: string) {
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || value === 'true' || value === 'false';
}

/**
 * Adds a label:"value" expression to the query.
 */
export function addAddHocFilter(query: string, filter: AdHocVariableFilter): string {
  const hasValidValue = ['exists', 'not exists'].includes(filter.operator) || hasFilterValue(filter.value)
  if (!filter.key || !hasValidValue) {
    return query;
  }

  filter = {
    ...filter,
    // Type is defined as string, but it can be a number.
    value: filter.value.toString(),
  };

  const equalityFilters = ['=', '!='];
  if (equalityFilters.includes(filter.operator)) {
    const modifier = filter.operator === '=' ? '' : '-';
    const key = escapeFilter(filter.key);
    // Grafana stringifies array values (e.g. ["paperclip","stapler"]) before
    // passing them as filter values. Tantivy indexes array elements as
    // individual terms — there's no way to match on array length, order, or
    // exact composition. For multi-element arrays we use IN (match any),
    // which is the most useful behavior for log exploration filters.
    const arrayElements = tryParseJsonArray(filter.value);
    if (arrayElements !== null) {
      if (arrayElements.length === 0) {
        return query;
      }
      if (arrayElements.length === 1) {
        return concatenate(query, `${modifier}${key}:${formatArrayElement(arrayElements[0])}`, 'AND');
      }
      const terms = arrayElements.map(formatArrayElement).join(' ');
      return concatenate(query, `${modifier}${key}:IN [${terms}]`, 'AND');
    }
    if (isLiteralValue(filter.value)) {
      return concatenate(query, `${modifier}${key}:${filter.value}`, 'AND');
    }
    return LuceneQuery.parse(query).addFilter(filter.key, filter.value, filter.operator === '=' ? '' : '-').toString();
  }
  /**
   * Keys and values in ad hoc filters may contain characters such as
   * colons, which needs to be escaped.
   */
  const key = escapeFilter(filter.key);
  const value = escapeFilterValue(filter.value);
  const termValue = escapeFilter(filter.value);
  let addHocFilter = '';
  switch (filter.operator) {
    case '=~':
      addHocFilter = `${key}:/${value}/`;
      break;
    case '!~':
      addHocFilter = `-${key}:/${value}/`;
      break;
    case '>':
      addHocFilter = `${key}:>${value}`;
      break;
    case '<':
      addHocFilter = `${key}:<${value}`;
      break;
    case 'term':
      addHocFilter = `${key}:${termValue}`;
      break;
    case 'not term':
      addHocFilter = `-${key}:${termValue}`;
      break;
    case 'exists':
      addHocFilter = `${key}:*`;
      break;
    case 'not exists':
      addHocFilter = `-${key}:*`;
      break;
  }
  return concatenate(query, addHocFilter,'AND');
}
