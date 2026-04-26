import { extractJsonPayload, fuzzySearchMatch, fuzzySearchSort, isSimpleToken } from "utils";

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

describe('fuzzy search helpers', () => {
  it('matches field names using token abbreviations', () => {
    expect(fuzzySearchMatch('attributes.grpc_message', 'grpc msg')).toBe(true);
  });

  it('matches values with missing characters', () => {
    expect(fuzzySearchMatch('Error invalid token', 'err invld')).toBe(true);
  });

  it('sorts stronger matches first', () => {
    const result = fuzzySearchSort(
      ['body.message', 'attributes.grpc_message', 'attributes.http_status'],
      (value) => value,
      'grpc msg'
    );

    expect(result[0]).toBe('attributes.grpc_message');
  });

  it('does not match unrelated values', () => {
    expect(fuzzySearchMatch('attributes.grpc_message', 'status code')).toBe(false);
  });
});

describe('isSimpleToken', () => {
  it('accepts analyzer-friendly bare tokens', () => {
    expect(isSimpleToken('auth_api_1')).toBe(true);
  });

  it('rejects punctuated values that should be quoted as phrases', () => {
    expect(isSimpleToken('auth-api')).toBe(false);
  });
});
