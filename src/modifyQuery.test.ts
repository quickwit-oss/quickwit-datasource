import { addAddHocFilter } from './modifyQuery';

describe('addAddHocFilter', () => {
  describe('current behavior with array values', () => {
    it('wraps equality filter value in quotes (phrase query)', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip"]',
      });
      // Current behavior: generates a phrase query with the stringified array
      expect(result).toBe('attributes.tags:"[\\"paperclip\\"]"');
    });

    it('wraps negated equality filter value in quotes', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '!=',
        value: '["paperclip"]',
      });
      expect(result).toBe('-attributes.tags:"[\\"paperclip\\"]"');
    });

    it('term operator produces unquoted query', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: 'term',
        value: 'paperclip',
      });
      expect(result).toBe('attributes.tags:paperclip');
    });

    it('not term operator produces negated unquoted query', () => {
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

    it('handles multi-element array value with equality', () => {
      const result = addAddHocFilter('', {
        key: 'attributes.tags',
        operator: '=',
        value: '["paperclip","stapler"]',
      });
      // Current behavior: entire stringified array becomes the phrase
      expect(result).toBe('attributes.tags:"[\\"paperclip\\",\\"stapler\\"]"');
    });
  });
});
