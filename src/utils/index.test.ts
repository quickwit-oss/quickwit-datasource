import { extractJsonPayload } from "utils"; 

describe('Test utils.extractJsonPayload', () => {
    it('Extract valid JSON', () => {
      const result = extractJsonPayload('Hey {"foo": "bar"}')
      expect(result).toEqual({
        foo: "bar"
      });
    });

    it('Extract non valid JSON', () => {
        const result = extractJsonPayload('Hey {"foo": invalid}')
        expect(result).toEqual(null);
    });

    it('Extract multiple valid JSONs (not supported)', () => {
        const result = extractJsonPayload('Hey {"foo": "bar"} {"foo2": "bar2"}')
        expect(result).toEqual(null);
    });
});
