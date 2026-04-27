import { ElasticsearchQuery } from './types';
import { normalizeInternalLinkQuery } from './queryModel';

describe('normalizeInternalLinkQuery', () => {
  const traceId = '75d7a6e5c07de26e0238cd17a281a190';

  it('converts exemplar-style bare trace ids into trace queries', () => {
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: traceId,
      metrics: [{ id: '3', type: 'logs', settings: { limit: '100' } }],
      bucketAggs: [{ id: '2', type: 'date_histogram' }],
      filters: [],
    };

    const normalized = normalizeInternalLinkQuery(query) as ElasticsearchQuery & { queryType: string };

    expect(normalized).not.toBe(query);
    expect(normalized.query).toBe(`trace_id:${traceId}`);
    expect(normalized.queryType).toBe('traces');
    expect(normalized.metrics).toEqual([{ id: '3', type: 'traces', settings: { limit: '100' } }]);
    expect(normalized.bucketAggs).toEqual([]);
  });

  it('uses queryType traces to fix stale default log metrics', () => {
    const query = {
      refId: 'A',
      query: `trace_id:${traceId}`,
      queryType: 'traces',
      metrics: [{ id: '3', type: 'logs', settings: { limit: '100' } }],
      bucketAggs: [],
      filters: [],
    } as ElasticsearchQuery & { queryType: 'traces' };

    const normalized = normalizeInternalLinkQuery(query);

    expect(normalized.metrics?.[0].type).toBe('traces');
    expect(normalized.query).toBe(`trace_id:${traceId}`);
  });

  it('leaves normal log queries unchanged', () => {
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: 'service_name:api',
      metrics: [{ id: '3', type: 'logs', settings: { limit: '100' } }],
      bucketAggs: [],
      filters: [],
    };

    expect(normalizeInternalLinkQuery(query)).toBe(query);
  });

  it('leaves normal metric queries with bare hex filters unchanged', () => {
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: traceId,
      metrics: [{ id: '1', type: 'count' }],
      bucketAggs: [{ id: '2', type: 'date_histogram' }],
      filters: [],
    };

    expect(normalizeInternalLinkQuery(query)).toBe(query);
  });

  it('leaves span-specific log correlation queries unchanged', () => {
    const query: ElasticsearchQuery = {
      refId: 'A',
      query: `trace_id:${traceId} AND span_id:cccccccccccccccc`,
      metrics: [{ id: '3', type: 'logs', settings: { limit: '100' } }],
      bucketAggs: [],
      filters: [],
    };

    expect(normalizeInternalLinkQuery(query)).toBe(query);
  });
});
