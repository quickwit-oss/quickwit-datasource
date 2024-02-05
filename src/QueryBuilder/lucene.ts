import { useState, useCallback } from 'react';
import * as lucene from "@/utils/lucene";
import { LuceneQuery as QueryBuilder } from '@/utils/lucene';

export type LuceneQueryBuilder = {
  query: string,
  parsedQuery: lucene.LuceneQuery,
  setQuery: (query: string) => void
  setParsedQuery: (query: lucene.LuceneQuery) => void
}

export function useQueryBuilder() {
  const [parsedQuery, _setParsedQuery] = useState<lucene.LuceneQuery>(QueryBuilder.parse(""));
  const [query, _setQuery] = useState<string>("");

  const setQuery = useCallback((query: string) => {
    _setQuery(query);
    _setParsedQuery(QueryBuilder.parse(query));
  }, [_setQuery, _setParsedQuery]);

  const setParsedQuery = useCallback((query: QueryBuilder) => {
    _setParsedQuery(query);
    _setQuery(query.toString());
  }, [_setQuery, _setParsedQuery]);

  return {
    query,
    parsedQuery,
    setQuery,
    setParsedQuery,
  }
}
