import { QueryFilter } from '@/types';

import { getPreviousAdHocFilters } from './index';

describe('FilterEditor helpers', () => {
  it('returns only complete filters before the current filter', () => {
    const filters: QueryFilter[] = [
      {
        id: 'first',
        filter: { key: 'service', operator: '=', value: 'frontend' },
      },
      {
        id: 'hidden',
        hide: true,
        filter: { key: 'cluster', operator: '=', value: 'prod' },
      },
      {
        id: 'incomplete',
        filter: { key: 'namespace', operator: '=', value: '' },
      },
      {
        id: 'current',
        filter: { key: 'attributes.grpc_message', operator: '=', value: '' },
      },
      {
        id: 'later',
        filter: { key: 'status', operator: '=', value: '500' },
      },
    ];

    expect(getPreviousAdHocFilters(filters, 'current')).toEqual([
      { key: 'service', operator: '=', value: 'frontend' },
    ]);
  });

  it('does not include previous term filters with whitespace values', () => {
    const filters: QueryFilter[] = [
      {
        id: 'invalid-term',
        filter: { key: 'message', operator: 'term', value: 'invalid token' },
      },
      {
        id: 'current',
        filter: { key: 'status', operator: '=', value: '' },
      },
    ];

    expect(getPreviousAdHocFilters(filters, 'current')).toEqual([]);
  });
});
