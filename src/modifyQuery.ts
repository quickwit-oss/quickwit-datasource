import { escapeFilter, escapeFilterValue, concatenate, LuceneQuery } from 'utils/lucene';
import { AdHocVariableFilter } from '@grafana/data';

function tryParseJsonArray(value: string): string[] | null {
  if (!value.startsWith('[')) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((el) => typeof el === 'string')) {
      return parsed;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * Adds a label:"value" expression to the query.
 */
export function addAddHocFilter(query: string, filter: AdHocVariableFilter): string {
  const hasValidValue = ['exists', 'not exists'].includes(filter.operator) || !!filter.value
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
    const arrayElements = tryParseJsonArray(filter.value);
    if (arrayElements !== null) {
      if (arrayElements.length === 0) {
        return query;
      }
      const modifier = filter.operator === '=' ? '' : '-';
      const key = escapeFilter(filter.key);
      const termFilters = arrayElements.map((el) => `${modifier}${key}:${escapeFilterValue(el)}`);
      const combined = termFilters.join(' OR ');
      return concatenate(query, combined, 'AND');
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
