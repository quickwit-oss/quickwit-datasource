import { addAddHocFilter } from './modifyQuery';

describe('addAddHocFilter', () => {
  describe('array values', () => {
    it('unwraps single-element array into a phrase query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip"]',
      });
      expect(result).toBe('attributes.tags:"paperclip"');
    });

    it('unwraps multi-element array into IN set query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip","stapler"]',
      });
      expect(result).toBe('attributes.tags:IN ["paperclip" "stapler"]');
    });

    it('negated single-element array produces negated phrase query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '!=',
        value: '["paperclip"]',
      });
      expect(result).toBe('-attributes.tags:"paperclip"');
    });

    it('negated multi-element array produces negated IN set query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '!=',
        value: '["paperclip","stapler"]',
      });
      expect(result).toBe('-attributes.tags:IN ["paperclip" "stapler"]');
    });

    it('appends array filter to existing query with AND', () => {
      const result = addAddHocFilter('status:200', {
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip"]',
      });
      expect(result).toBe('status:200 AND attributes.tags:"paperclip"');
    });

    it('handles single-element array with spaces in value', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["foo bar"]',
      });
      expect(result).toBe('attributes.tags:"foo bar"');
    });

    it('handles single-element array with colons in value', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["foo:bar"]',
      });
      expect(result).toBe('attributes.tags:"foo:bar"');
    });

    it('handles multi-element array with spaces in values', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["foo bar","baz qux"]',
      });
      expect(result).toBe('attributes.tags:IN ["foo bar" "baz qux"]');
    });

    it('handles single-element numeric arrays', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.codes',
        operator: '=',
        value: '[200]',
      });
      expect(result).toBe('attributes.codes:200');
    });

    it('handles multi-element numeric arrays with IN set query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.codes',
        operator: '=',
        value: '[200,500]',
      });
      expect(result).toBe('attributes.codes:IN [200 500]');
    });

    it('keeps negative numeric array values unquoted', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.deltas',
        operator: '=',
        value: '[-1,2]',
      });
      expect(result).toBe('attributes.deltas:IN [-1 2]');
    });

    it('handles boolean arrays with IN set query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.flags',
        operator: '=',
        value: '[true,false]',
      });
      expect(result).toBe('attributes.flags:IN [true false]');
    });

    it('handles mixed scalar arrays with IN set query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.values',
        operator: '=',
        value: '["paperclip",200,true]',
      });
      expect(result).toBe('attributes.values:IN ["paperclip" 200 true]');
    });

    it('negates numeric arrays with IN set query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.codes',
        operator: '!=',
        value: '[200,500]',
      });
      expect(result).toBe('-attributes.codes:IN [200 500]');
    });

    it('handles array values containing double quotes', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["say \\"hello\\""]',
      });
      expect(result).toBe('attributes.tags:"say \\"hello\\""');
    });

    it('passes through non-array bracket strings unchanged', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.message',
        operator: '=',
        value: '[not json',
      });
      expect(result).toBe('attributes.message:"[not json"');
    });

    it('term operator still produces unquoted query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: 'term',
        value: 'paperclip',
      });
      expect(result).toBe('attributes.tags:paperclip');
    });

    it('not term operator still produces negated unquoted query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: 'not term',
        value: 'paperclip',
      });
      expect(result).toBe('-attributes.tags:paperclip');
    });
  });

  describe('scalar value filters', () => {
    it('equality on simple string value', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.controller',
        operator: '=',
        value: 'BlogController',
      });
      expect(result).toBe('attributes.controller:"BlogController"');
    });

    it('appends to existing query with AND', () => {
      const result = addAddHocFilter('status:200', {
        key: 'attributes.controller',
        operator: '=',
        value: 'BlogController',
      });
      expect(result).toBe('status:200 AND attributes.controller:"BlogController"');
    });

    it('renders numeric equality filters as unquoted literals', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.status_code',
        operator: '=',
        value: '200',
      });
      expect(result).toBe('attributes.status_code:200');
    });

    it('keeps numeric zero as a valid filter value', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.retry_count',
        operator: '=',
        value: 0 as any,
      });
      expect(result).toBe('attributes.retry_count:0');
    });

    it('keeps boolean false as a valid filter value', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.cache_hit',
        operator: '=',
        value: false as any,
      });
      expect(result).toBe('attributes.cache_hit:false');
    });

    it('renders negated boolean equality filters as unquoted literals', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.cache_hit',
        operator: '!=',
        value: false as any,
      });
      expect(result).toBe('-attributes.cache_hit:false');
    });

    it('exists operator', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: 'exists',
        value: '',
      });
      expect(result).toBe('attributes.tags:*');
    });

    it('not exists operator', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: 'not exists',
        value: '',
      });
      expect(result).toBe('-attributes.tags:*');
    });

    it('regex operator', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.controller',
        operator: '=~',
        value: 'Blog.*',
      });
      expect(result).toBe('attributes.controller:/Blog.*/');
    });

    it('greater than operator', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.duration',
        operator: '>',
        value: '100',
      });
      expect(result).toBe('attributes.duration:>100');
    });

    it('less than operator', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.duration',
        operator: '<',
        value: '100',
      });
      expect(result).toBe('attributes.duration:<100');
    });
  });

  describe('edge cases', () => {
    it('returns query unchanged when key is empty', () => {
      const result = addAddHocFilter('existing', {
        key: '',
        operator: '=',
        value: 'test',
      });
      expect(result).toBe('existing');
    });

    it('returns query unchanged when value is empty for non-exists operators', () => {
      const result = addAddHocFilter('existing', {
        key: 'field',
        operator: '=',
        value: '',
      });
      expect(result).toBe('existing');
    });

    it('treats empty JSON array as no-op', () => {
      const result = addAddHocFilter('existing', {
        key: 'attributes.tags',
        operator: '=',
        value: '[]',
      });
      expect(result).toBe('existing');
    });
  });
});
