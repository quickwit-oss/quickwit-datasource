import React, { useEffect, useState, useCallback, useMemo } from "react";
import { LogRowModel } from '@grafana/data';
import { ElasticsearchQuery as DataQuery } from '../../types';
import { LuceneQueryEditor } from "../../components/LuceneQueryEditor";

import { css } from "@emotion/css";
import { Button } from "@grafana/ui";
import { useQueryBuilder } from '@/QueryBuilder/lucene';
import { LogContextQueryBuilderSidebar } from "./LogContextQueryBuilderSidebar";
import { DatasourceContext } from "components/QueryEditor/ElasticsearchQueryContext";
import { QuickwitDataSource } from "datasource";
import { useDatasourceFields } from "datasource.utils";

const logContextUiStyle = css`
  display: flex;
  gap: 1rem;
  width: 100%;
  height: 200px;
`

export interface LogContextProps {
  row: LogRowModel,
  runContextQuery?: (() => void)
  origQuery?: DataQuery
}
export interface LogContextUIProps extends LogContextProps {
  datasource: QuickwitDataSource,
  updateQuery: (query: string) => void
}

export function LogContextUI(props: LogContextUIProps ){
  const builder = useQueryBuilder();
  const {query, parsedQuery, setQuery, setParsedQuery} = builder;
  const [canRunQuery, setCanRunQuery] = useState<boolean>(false);
  const { origQuery, updateQuery, runContextQuery } = props;
  const {fields, getSuggestions} = useDatasourceFields(props.datasource);

  useEffect(()=>{
    setQuery(origQuery?.query || '')
  }, [setQuery, origQuery])

  useEffect(()=>{
    setCanRunQuery(!parsedQuery.parseError)
  }, [parsedQuery, setCanRunQuery])

  const runQuery = useCallback(()=>{
    if (runContextQuery){
      updateQuery(query);
      runContextQuery();
    }
  }, [query, runContextQuery, updateQuery])

  const ActionBar = useMemo(()=>(
    <div className={css`display:flex; justify-content:end; flex:0 0; gap:0.5rem;`}>
      <Button variant="secondary" onClick={()=>setQuery('')}>Clear</Button>
      <Button variant="secondary" onClick={()=>setQuery(origQuery?.query || '')}>Reset</Button>
      <Button onClick={runQuery} {...canRunQuery ? {} : {disabled:true, tooltip:"Failed to parse query"}} >Run query</Button>
    </div>
  ), [setQuery, canRunQuery, origQuery, runQuery])

  return (
    <div className={logContextUiStyle}>
      <DatasourceContext.Provider value={props.datasource}>
        <LogContextQueryBuilderSidebar {...props} builder={builder} updateQuery={setParsedQuery} searchableFields={fields}/>
        <div className={css`width:100%; display:flex; flex-direction:column; gap:0.5rem; min-width:0;`}>
          {ActionBar}
          <LuceneQueryEditor value={builder.query} autocompleter={getSuggestions} onChange={builder.setQuery}/>
        </div>
      </DatasourceContext.Provider>
    </div>
  );
}
