import { addAddHocFilter } from './modifyQuery';

describe('addAddHocFilter', () => {
  describe('array values', () => {
    it('unwraps single-element array into a term query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip"]',
      });
      expect(result).toBe('attributes.tags:paperclip');
    });

    it('unwraps multi-element array into IN set query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip","stapler"]',
      });
      expect(result).toBe('attributes.tags:IN ["paperclip" "stapler"]');
    });

    it('negated single-element array produces negated term query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '!=',
        value: '["paperclip"]',
      });
      expect(result).toBe('-attributes.tags:paperclip');
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
      expect(result).toBe('status:200 AND attributes.tags:paperclip');
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
