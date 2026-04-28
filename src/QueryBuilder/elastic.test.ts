import { getDataQuery } from './elastic';

describe('getDataQuery', () => {
  it('uses the requested terms size for autocomplete queries', () => {
    const query = getDataQuery({ field: 'status', size: 250 }, 'getTerms');

    expect(query.bucketAggs?.[0].settings).toEqual(
      expect.objectContaining({
        size: '250',
        shard_size: '250',
      })
    );
  });

  it('keeps zero as no terms limit', () => {
    const query = getDataQuery({ field: 'status', size: 0 }, 'getTerms');

    expect(query.bucketAggs?.[0].settings).toEqual(
      expect.objectContaining({
        size: '0',
        shard_size: '0',
      })
    );
  });
});
