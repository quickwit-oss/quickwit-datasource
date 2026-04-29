import { AdHocVariableFilter } from '@grafana/data';
import { from } from 'rxjs';

import { addAddHocFilter } from '../modifyQuery';
import { ElasticsearchQuery } from '../types';
import {
  BaseQuickwitDataSource,
  formatQuery,
  luceneEscape,
  parseFilterAutocompleteChainMode,
  parseFilterAutocompleteLimit,
} from './base';

describe('BaseQuickwitDataSource', () => {
  describe('luceneEscape', () => {
    it('should not escape numeric values', () => {
      expect(luceneEscape('123')).toBe('123');
      expect(luceneEscape('123.45')).toBe('123.45');
    });

    it('should escape special Lucene characters', () => {
      expect(luceneEscape('test+value')).toBe('test\\+value');
      expect(luceneEscape('test-value')).toBe('test\\-value');
      expect(luceneEscape('test:value')).toBe('test\\:value');
      expect(luceneEscape('test"value"')).toBe('test\\"value\\"');
    });

    it('should handle empty strings', () => {
      expect(luceneEscape('')).toBe('');
    });

    it('should handle strings with multiple special characters', () => {
      expect(luceneEscape('field:value AND other:test')).toBe('field\\:value\\ AND\\ other\\:test');
    });
  });

  describe('formatQuery', () => {
    describe('String values', () => {
      it('should return escaped string for simple string values', () => {
        const result = formatQuery('simple_value', { id: 'test_var' });
        expect(result).toBe('simple_value');
      });

      it('should escape special characters in string values', () => {
        const result = formatQuery('value+with-special:chars', { id: 'test_var' });
        expect(result).toBe('value\\+with\\-special\\:chars');
      });

      it('should not escape numeric strings', () => {
        const result = formatQuery('123', { id: 'test_var' });
        expect(result).toBe('123');
      });
    });

    describe('Array values with valid field configuration', () => {
      const validVariable = {
        id: 'test_var',
        query: '{"field": "status"}'
      };

      it('should format array values with field-specific OR syntax', () => {
        const result = formatQuery(['error', 'warning'], validVariable);
        expect(result).toBe('"error" OR status:"warning"');
      });

      it('should handle single-item arrays', () => {
        const result = formatQuery(['error'], validVariable);
        expect(result).toBe('"error"');
      });

      it('should escape special characters in array values', () => {
        const result = formatQuery(['error+critical', 'warning:high'], validVariable);
        expect(result).toBe('"error\\+critical" OR status:"warning\\:high"');
      });
    });

    describe('Array values without field configuration', () => {
      it('should use OR syntax when variable.query is undefined', () => {
        const variable = { id: 'test_var' };
        const result = formatQuery(['error', 'warning'], variable);
        expect(result).toBe('"error" OR "warning"');
      });

      it('should use OR syntax when variable.query is null', () => {
        const variable = { id: 'test_var', query: null };
        const result = formatQuery(['error', 'warning'], variable);
        expect(result).toBe('"error" OR "warning"');
      });

      it('should use OR syntax when variable.query contains invalid JSON', () => {
        const variable = { id: 'test_var', query: 'not valid json' };
        const result = formatQuery(['error', 'warning'], variable);
        expect(result).toBe('"error" OR "warning"');
      });

      it('should use OR syntax when variable.query is valid JSON but missing field', () => {
        const variable = { id: 'test_var', query: '{"other": "value"}' };
        const result = formatQuery(['error', 'warning'], variable);
        expect(result).toBe('"error" OR "warning"');
      });

      it('should use OR syntax when field is not a string', () => {
        const variable = { id: 'test_var', query: '{"field": 123}' };
        const result = formatQuery(['error', 'warning'], variable);
        expect(result).toBe('"error" OR "warning"');
      });

      it('should infer field-specific OR syntax from the query string', () => {
        const variable = { id: 'levels' };
        const result = formatQuery(['error', 'warning'], variable, 'severity_text:$levels');
        expect(result).toBe('"error" OR severity_text:"warning"');
      });

      it('should infer field-specific OR syntax from braced variables in the query string', () => {
        const variable = { id: 'services' };
        const result = formatQuery(['web', 'api'], variable, 'resource_attributes.service.name:${services}');
        expect(result).toBe('"web" OR resource_attributes.service.name:"api"');
      });
    });

    describe('Empty arrays', () => {
      it('should return __empty__ for empty arrays', () => {
        const variable = { id: 'test_var', query: '{"field": "status"}' };
        const result = formatQuery([], variable);
        expect(result).toBe('__empty__');
      });

      it('should return __empty__ for empty arrays even without field config', () => {
        const variable = { id: 'test_var' };
        const result = formatQuery([], variable);
        expect(result).toBe('__empty__');
      });
    });

    describe('Error handling and robustness', () => {
      it('should not throw when variable.query is undefined', () => {
        expect(() => {
          formatQuery(['test'], { id: 'test_var' });
        }).not.toThrow();
      });

      it('should not throw when variable.query is malformed JSON', () => {
        expect(() => {
          formatQuery(['test'], { id: 'test_var', query: '{invalid json}' });
        }).not.toThrow();
      });

      it('should not throw when variable.query is empty string', () => {
        expect(() => {
          formatQuery(['test'], { id: 'test_var', query: '' });
        }).not.toThrow();
      });

      it('should handle non-string, non-array values', () => {
        const result = formatQuery(123 as any, { id: 'test_var' });
        expect(result).toBe('123');
      });

      it('should handle boolean values', () => {
        const result = formatQuery(true as any, { id: 'test_var' });
        expect(result).toBe('true');
      });
    });

    describe('Real-world scenarios', () => {
      it('should handle variables from template variable queries', () => {
        // Simulates a properly configured template variable
        const templateVariable = {
          id: 'log_level',
          query: '{"field": "level"}'
        };
        const result = formatQuery(['ERROR', 'WARN', 'INFO'], templateVariable);
        expect(result).toBe('"ERROR" OR level:"WARN" OR level:"INFO"');
      });

      it('should handle variables without query configuration (legacy/simple variables)', () => {
        // Simulates a simple template variable without field configuration
        const simpleVariable = {
          id: 'service_names'
        };
        const result = formatQuery(['web-service', 'api-service'], simpleVariable);
        expect(result).toBe('"web\\-service" OR "api\\-service"');
      });

      it('should handle variables with corrupted configuration', () => {
        // Simulates a variable with corrupted/invalid configuration
        const corruptedVariable = {
          id: 'corrupted_var',
          query: '{"field": undefined}' // Invalid JSON that might come from UI bugs
        };
        const result = formatQuery(['value1', 'value2'], corruptedVariable);
        expect(result).toBe('"value1" OR "value2"');
      });
    });
  });

  describe('quick filters', () => {
    const addFilterToQuery = (
      fieldTypes: Record<string, string>,
      query: ElasticsearchQuery,
      key: string,
      value: string,
      negate = false
    ) => {
      return (BaseQuickwitDataSource.prototype as any).addFilterToQuery.call(
        Object.assign(Object.create(BaseQuickwitDataSource.prototype), { fieldTypes }),
        query,
        key,
        value,
        negate
      ) as ElasticsearchQuery;
    };

    const renderAdHocFilters = (
      fieldTypes: Record<string, string>,
      filters: AdHocVariableFilter[]
    ) => {
      return (BaseQuickwitDataSource.prototype as any).addAdHocFilters.call(
        { fieldTypes },
        '',
        filters
      ) as string;
    };

    const datasourceContext = (overrides: Record<string, unknown>) =>
      Object.assign(Object.create(BaseQuickwitDataSource.prototype), overrides);

    it('adds text filters with whitespace as phrase filters', () => {
      const query = { refId: 'A', query: '', metrics: [], bucketAggs: [], filters: [] } as any;

      const updatedQuery = addFilterToQuery(
        { 'attributes.grpc_message': 'text' },
        query,
        'attributes.grpc_message',
        'Error:[(0) invalid token, ]'
      );

      expect(updatedQuery.filters?.[0].filter).toEqual({
        key: 'attributes.grpc_message',
        operator: '=',
        value: 'Error:[(0) invalid token, ]',
      });
    });

    it('renders text phrase filters with quoted Quickwit syntax', () => {
      const result = renderAdHocFilters(
        { 'attributes.grpc_message': 'text' },
        [{
          key: 'attributes.grpc_message',
          operator: '=',
          value: 'Error:[(0) invalid token, ]',
        }]
      );

      expect(result).toBe('attributes.grpc_message:"Error:[(0) invalid token, ]"');
    });

    it('renders negative text phrase filters with quoted Quickwit syntax', () => {
      const result = renderAdHocFilters(
        { 'attributes.grpc_message': 'text' },
        [{
          key: 'attributes.grpc_message',
          operator: '!=',
          value: 'Error:[(0) invalid token, ]',
        }]
      );

      expect(result).toBe('-attributes.grpc_message:"Error:[(0) invalid token, ]"');
    });

    it('keeps simple-token text filters as term filters', () => {
      const query = { refId: 'A', query: '', metrics: [], bucketAggs: [], filters: [] } as any;

      const updatedQuery = addFilterToQuery(
        { 'attributes.grpc_message': 'text' },
        query,
        'attributes.grpc_message',
        'unavailable'
      );

      expect(updatedQuery.filters?.[0].filter.operator).toBe('term');
    });

    it('reuses trailing empty filters without mutating the original query', () => {
      const query = {
        refId: 'A',
        query: '',
        metrics: [],
        bucketAggs: [],
        filters: [{ id: 'empty', filter: { key: '', operator: '=', value: '' } }],
      } as any;

      const updatedQuery = addFilterToQuery(
        { service_name: 'text' },
        query,
        'service_name',
        'frontend'
      );

      expect(updatedQuery).not.toBe(query);
      expect(updatedQuery.filters?.[0]).toEqual({
        id: 'empty',
        hide: false,
        filter: { key: 'service_name', operator: 'term', value: 'frontend' },
      });
      expect(query.filters[0].filter).toEqual({ key: '', operator: '=', value: '' });
    });

    it('adds quick filters when filters are undefined', () => {
      const query = { refId: 'A', query: '', metrics: [], bucketAggs: [] } as any;

      const updatedQuery = addFilterToQuery(
        { service_name: 'text' },
        query,
        'service_name',
        'frontend'
      );

      expect(updatedQuery.filters).toEqual([
        expect.objectContaining({
          hide: false,
          filter: { key: 'service_name', operator: 'term', value: 'frontend' },
        }),
      ]);
    });

    it('keeps JSON array text filters as equality filters', () => {
      const query = { refId: 'A', query: '', metrics: [], bucketAggs: [], filters: [] } as any;

      const updatedQuery = addFilterToQuery(
        { 'attributes.tags': 'text' },
        query,
        'attributes.tags',
        '["paperclip"]'
      );

      expect(updatedQuery.filters?.[0].filter).toEqual({
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip"]',
      });
    });

    it('renders JSON array text filters with Quickwit array syntax', () => {
      const result = renderAdHocFilters(
        { 'attributes.tags': 'text' },
        [{
          key: 'attributes.tags',
          operator: '=',
          value: '["paperclip","stapler"]',
        }]
      );

      expect(result).toBe('attributes.tags:IN ["paperclip" "stapler"]');
    });

    it('keeps punctuated text filters as phrase filters', () => {
      const query = { refId: 'A', query: '', metrics: [], bucketAggs: [], filters: [] } as any;

      const updatedQuery = addFilterToQuery(
        { service_name: 'text' },
        query,
        'service_name',
        'auth-api'
      );

      expect(updatedQuery.filters?.[0].filter).toEqual({
        key: 'service_name',
        operator: '=',
        value: 'auth-api',
      });
    });

    it('renders punctuated text filters with quoted Quickwit syntax', () => {
      const result = renderAdHocFilters(
        { service_name: 'text' },
        [{
          key: 'service_name',
          operator: '=',
          value: 'auth-api',
        }]
      );

      expect(result).toBe('service_name:"auth-api"');
    });

    it('escapes special characters in unquoted term filters', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.grpc_message',
        operator: 'term',
        value: 'error:foo',
      });

      expect(result).toBe('attributes.grpc_message:error\\:foo');
    });

    it('toggles off matching quick filters by operator', () => {
      const query = {
        refId: 'A',
        query: '',
        metrics: [],
        bucketAggs: [],
        filters: [{ id: 'existing', filter: { key: 'service_name', operator: 'term', value: 'frontend' } }],
      } as any;

      const updatedQuery = (BaseQuickwitDataSource.prototype as any).toggleQueryFilter.call(
        datasourceContext({ fieldTypes: { service_name: 'text' } }),
        query,
        { type: 'FILTER_FOR', options: { key: 'service_name', value: 'frontend' } }
      );

      expect(updatedQuery.filters).toEqual([{ id: expect.any(String), filter: { key: '', operator: '=', value: '' } }]);
    });

    it('replaces opposite quick filters instead of adding duplicates', () => {
      const query = {
        refId: 'A',
        query: '',
        metrics: [],
        bucketAggs: [],
        filters: [{ id: 'existing', filter: { key: 'service_name', operator: 'not term', value: 'frontend' } }],
      } as any;

      const updatedQuery = (BaseQuickwitDataSource.prototype as any).toggleQueryFilter.call(
        datasourceContext({ fieldTypes: { service_name: 'text' } }),
        query,
        { type: 'FILTER_FOR', options: { key: 'service_name', value: 'frontend' } }
      );

      expect(updatedQuery.filters).toEqual([
        { id: 'existing', hide: false, filter: { key: 'service_name', operator: 'term', value: 'frontend' } },
      ]);
    });

    it('can check quick filters by operator when Grafana provides filter direction', () => {
      const query = {
        refId: 'A',
        query: '',
        metrics: [],
        bucketAggs: [],
        filters: [{ id: 'existing', filter: { key: 'service_name', operator: 'not term', value: 'frontend' } }],
      } as any;
      const datasource = datasourceContext({ fieldTypes: { service_name: 'text' } });

      expect((BaseQuickwitDataSource.prototype as any).queryHasFilter.call(
        datasource,
        query,
        { key: 'service_name', value: 'frontend', type: 'FILTER_FOR' }
      )).toBe(false);
      expect((BaseQuickwitDataSource.prototype as any).queryHasFilter.call(
        datasource,
        query,
        { key: 'service_name', value: 'frontend', type: 'FILTER_OUT' }
      )).toBe(true);
    });

    it('applies prior filters when loading tag values', async () => {
      const getTerms = jest.fn(() => from([[]]));

      await (BaseQuickwitDataSource.prototype as any).getTagValues.call(
        datasourceContext({
          fieldTypes: {},
          filterAutocompleteLimit: 1000,
          filterAutocompleteUseFilterChains: true,
          getTerms,
        }),
        {
          key: 'status',
          filters: [{ key: 'service', operator: '=', value: 'frontend' }],
        }
      );

      expect(getTerms).toHaveBeenCalledWith(
        { field: 'status', query: 'service:"frontend"', size: 1000 },
        undefined
      );
    });

    it('uses the datasource autocomplete limit when loading tag values', async () => {
      const getTerms = jest.fn(() => from([[]]));

      await (BaseQuickwitDataSource.prototype as any).getTagValues.call(
        datasourceContext({
          fieldTypes: {},
          filterAutocompleteLimit: 250,
          filterAutocompleteUseFilterChains: true,
          getTerms,
        }),
        {
          key: 'status',
          filters: [{ key: 'service', operator: '=', value: 'frontend' }],
        }
      );

      expect(getTerms).toHaveBeenCalledWith(
        { field: 'status', query: 'service:"frontend"', size: 250 },
        undefined
      );
    });

    it('can disable filter chains for tag values', async () => {
      const getTerms = jest.fn(() => from([[]]));

      await (BaseQuickwitDataSource.prototype as any).getTagValues.call(
        datasourceContext({
          fieldTypes: {},
          filterAutocompleteLimit: 1000,
          filterAutocompleteUseFilterChains: false,
          getTerms,
        }),
        {
          key: 'status',
          filters: [{ key: 'service', operator: '=', value: 'frontend' }],
        }
      );

      expect(getTerms).toHaveBeenCalledWith(
        { field: 'status', query: '', size: 1000 },
        undefined
      );
    });

    it('derives chained tag keys from fields present in matching documents', async () => {
      const getFields = jest.fn(() =>
        from([[
          { text: 'service', type: 'string' },
          { text: 'status', type: 'string' },
          { text: 'missing', type: 'string' },
        ]])
      );
      const query = jest.fn(() =>
        from([{
          data: [
            {
              fields: [
                { name: 'service' },
                { name: 'status' },
                { name: 'sort' },
              ],
            },
          ],
        }])
      );

      const result = await (BaseQuickwitDataSource.prototype as any).getTagKeys.call(
        datasourceContext({
          fieldTypes: {},
          filterAutocompleteLimit: 5,
          filterAutocompleteUseFilterChains: true,
          getFields,
          query,
        }),
        {
          filters: [{ key: 'service', operator: '=', value: 'frontend' }],
        }
      );

      expect(result).toEqual([
        { text: 'service', type: 'string' },
        { text: 'status', type: 'string' },
      ]);
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.stringMatching(/^getFilterKeys-/),
          targets: [
            expect.objectContaining({
              query: 'service:"frontend"',
              metrics: [{ id: 'filterKeys', type: 'raw_data', settings: { size: '5' } }],
            }),
          ],
        })
      );
    });

    it('derives full chained tag keys from every matching document', async () => {
      const getFields = jest.fn(() =>
        from([[
          { text: 'service', type: 'string' },
          { text: 'status', type: 'string' },
          { text: 'rare.field', type: 'string' },
          { text: 'missing', type: 'string' },
        ]])
      );
      const postResource = jest.fn()
        .mockResolvedValueOnce({
          num_hits: 2,
          hits: [{ service: 'frontend', status: 'ok' }],
        })
        .mockResolvedValueOnce({
          num_hits: 2,
          hits: [{ service: 'frontend', rare: { field: 'present' } }],
        });

      const result = await (BaseQuickwitDataSource.prototype as any).getTagKeys.call(
        datasourceContext({
          fieldTypes: {},
          filterAutocompleteChainMode: 'full',
          getFields,
          index: 'logs',
          postResource,
        }),
        {
          filters: [{ key: 'service', operator: '=', value: 'frontend' }],
        }
      );

      expect(result).toEqual([
        { text: 'service', type: 'string' },
        { text: 'status', type: 'string' },
        { text: 'rare.field', type: 'string' },
      ]);
      expect(postResource).toHaveBeenCalledTimes(2);
      expect(postResource).toHaveBeenNthCalledWith(
        1,
        'indexes/logs/search',
        expect.objectContaining({
          query: 'service:"frontend"',
          max_hits: 1000,
          start_offset: 0,
        }),
        expect.objectContaining({ requestId: expect.stringMatching(/^getFilterKeysFull-/) })
      );
      expect(postResource).toHaveBeenNthCalledWith(
        2,
        'indexes/logs/search',
        expect.objectContaining({
          query: 'service:"frontend"',
          max_hits: 1000,
          start_offset: 1,
        }),
        expect.objectContaining({ requestId: expect.stringMatching(/^getFilterKeysFull-/) })
      );
    });

    it('deduplicates tag keys that have multiple field capabilities', async () => {
      const getFields = jest.fn(() =>
        from([[
          { text: 'service_name', type: 'string' },
          { text: 'service_name', type: 'keyword' },
          { text: 'severity_text', type: 'string' },
        ]])
      );

      const result = await (BaseQuickwitDataSource.prototype as any).getTagKeys.call(
        datasourceContext({
          filterAutocompleteUseFilterChains: true,
          getFields,
        }),
        {}
      );

      expect(result).toEqual([
        { text: 'service_name', type: 'string' },
        { text: 'severity_text', type: 'string' },
      ]);
    });

    it('can disable filter chains for tag keys', async () => {
      const getFields = jest.fn(() => from([[{ text: 'service', type: 'string' }]]));
      const query = jest.fn();

      const result = await (BaseQuickwitDataSource.prototype as any).getTagKeys.call(
        datasourceContext({
          filterAutocompleteUseFilterChains: false,
          getFields,
          query,
        }),
        {
          filters: [{ key: 'service', operator: '=', value: 'frontend' }],
        }
      );

      expect(result).toEqual([{ text: 'service', type: 'string' }]);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('filter autocomplete limit', () => {
    it('defaults invalid and empty values to 1000', () => {
      expect(parseFilterAutocompleteLimit(undefined)).toBe(1000);
      expect(parseFilterAutocompleteLimit('')).toBe(1000);
      expect(parseFilterAutocompleteLimit('invalid')).toBe(1000);
      expect(parseFilterAutocompleteLimit('-1')).toBe(1000);
    });

    it('accepts positive values and zero', () => {
      expect(parseFilterAutocompleteLimit('250')).toBe(250);
      expect(parseFilterAutocompleteLimit('0')).toBe(0);
    });
  });

  describe('filter autocomplete chain mode', () => {
    it('defaults missing and invalid modes to sample', () => {
      expect(parseFilterAutocompleteChainMode(undefined)).toBe('sample');
      expect(parseFilterAutocompleteChainMode('invalid')).toBe('sample');
    });

    it('accepts supported modes', () => {
      expect(parseFilterAutocompleteChainMode('none')).toBe('none');
      expect(parseFilterAutocompleteChainMode('sample')).toBe('sample');
      expect(parseFilterAutocompleteChainMode('full')).toBe('full');
    });

    it('maps legacy disabled filter chains to none', () => {
      expect(parseFilterAutocompleteChainMode(undefined, false)).toBe('none');
    });
  });
});
