import { formatQuery, luceneEscape } from './base';

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
    it('should use IN syntax when variable.query is undefined', () => {
      const variable = { id: 'test_var' };
      const result = formatQuery(['error', 'warning'], variable);
      expect(result).toBe('IN ["error" "warning"]');
    });

    it('should use IN syntax when variable.query is null', () => {
      const variable = { id: 'test_var', query: null };
      const result = formatQuery(['error', 'warning'], variable);
      expect(result).toBe('IN ["error" "warning"]');
    });

    it('should use IN syntax when variable.query contains invalid JSON', () => {
      const variable = { id: 'test_var', query: 'not valid json' };
      const result = formatQuery(['error', 'warning'], variable);
      expect(result).toBe('IN ["error" "warning"]');
    });

    it('should use IN syntax when variable.query is valid JSON but missing field', () => {
      const variable = { id: 'test_var', query: '{"other": "value"}' };
      const result = formatQuery(['error', 'warning'], variable);
      expect(result).toBe('IN ["error" "warning"]');
    });

    it('should use IN syntax when field is not a string', () => {
      const variable = { id: 'test_var', query: '{"field": 123}' };
      const result = formatQuery(['error', 'warning'], variable);
      expect(result).toBe('IN ["error" "warning"]');
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
      expect(result).toBe('IN ["web\\-service" "api\\-service"]');
    });

    it('should handle variables with corrupted configuration', () => {
      // Simulates a variable with corrupted/invalid configuration
      const corruptedVariable = {
        id: 'corrupted_var',
        query: '{"field": undefined}' // Invalid JSON that might come from UI bugs
      };
      const result = formatQuery(['value1', 'value2'], corruptedVariable);
      expect(result).toBe('IN ["value1" "value2"]');
    });
  });
  });
});
