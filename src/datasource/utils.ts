import { BaseQuickwitDataSource } from "./base";
import { useState, useEffect, useCallback } from "react";
import{ MetricFindValue, TimeRange } from '@grafana/data';

/**
 * Provide suggestions based on datasource fields
 */

export type Suggestion = {
  from: number,
  options: Array<{
    label: string,
    detail?: string,
    type?: string,
  }>
}

export function useDatasourceFields(datasource: BaseQuickwitDataSource, range: TimeRange) {
  const [fields, setFields] = useState<MetricFindValue[]>([]);

  const [niceRange, setNiceRange] = useState(()=>range)

  useEffect(() => {
    // range may change several times during a render with a delta of a few hundred milliseconds
    // we don't need to fetch with such a granularity, this effect filters out range updates that are within the same minute
    if (range.from.isSame(niceRange.from, 'minute') && range.to.isSame(niceRange.to, 'minute')) { return }
    setNiceRange(range)
  },[range, niceRange])

  useEffect(() => {
    if (datasource.getTagKeys) {
      datasource.getTagKeys({ searchable: true, timeRange: niceRange}).then(setFields);
    }
  }, [datasource, niceRange])

  const getSuggestions = useCallback(async (word: string): Promise<Suggestion> => {
    let suggestions: Suggestion = { from: 0, options: [] };

    const wordIsField = word.match(/([^:\s]+):"?([^"\s]*)"?/);
    if (wordIsField?.length) {
      const [_match, fieldName, _fieldValue] = wordIsField;
      const candidateValues = await datasource.getTagValues({ key: fieldName, timeRange: range });
      suggestions.from = fieldName.length + 1; // Replace only the value part
      suggestions.options = candidateValues.map(v => ({
        type: 'text',
        label: typeof v.text === 'number' ? `${v.text}` : `"${v.text}"`
      }));
    } else {
      const candidateFields = fields;
      suggestions.from = 0;
      suggestions.options = candidateFields.map(f => ({
        type: 'variable',
        label: f.text,
        detail: `${f.value}`
      }));
    }
    return suggestions;

  }, [datasource, fields, range]);

  return {fields, getSuggestions}
}
