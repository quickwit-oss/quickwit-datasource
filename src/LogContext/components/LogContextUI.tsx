import React, { useEffect, useState, useCallback, useMemo } from "react";
import { LogRowModel, Field as GrafanaField } from '@grafana/data';
import { ElasticsearchQuery as DataQuery } from '../../types';
import { LuceneQueryEditor } from "../../components/LuceneQueryEditor";

import { css } from "@emotion/css";
import { Button } from "@grafana/ui";
import { useQueryBuilder } from '@/QueryBuilder/lucene';
import { LogContextQueryBuilderSidebar } from "./LogContextQueryBuilderSidebar";
import { DatasourceContext } from "@/components/QueryEditor/ElasticsearchQueryContext";
import { BaseQuickwitDataSource } from "@/datasource/base";
import { useDatasourceFields } from "@/datasource/utils";
import { Field, FieldContingency, Filter } from "../types";
import { createContextTimeRange } from 'LogContext/utils';

// TODO : define sensible defaults here
// const excludedFields = [
//   '_source',
//   'sort',
//   'attributes',
//   'attributes.message',
//   'body',
//   'body.message',
//   'resource_attributes',
//   'observed_timestamp_nanos',
//   'timestamp_nanos',
// ];

function isPrimitive(valT: any) {
  return ['string', 'number', "boolean", "undefined"].includes(valT)
}

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
  datasource: BaseQuickwitDataSource,
  updateQuery: (query: string) => void
}

export function LogContextUI(props: LogContextUIProps ){
  const builder = useQueryBuilder();
  const {query, /*parsedQuery,*/ setQuery, setParsedQuery} = builder;
  const [canRunQuery, /*setCanRunQuery*/] = useState<boolean>(true);
  const {row, origQuery, updateQuery, runContextQuery } = props;

  const fieldsSuggestionTimeRange = useMemo(()=>createContextTimeRange(row.timeEpochMs), [row])
  const {fields, getSuggestions} = useDatasourceFields(props.datasource, fieldsSuggestionTimeRange);

  useEffect(()=>{
    setQuery(origQuery?.query || '')
  }, [setQuery, origQuery])

  // FIXME : query parser used for lint is not reliable enough
  // to use as a filter for wrong queries. Disabled for now.
  // useEffect(()=>{
  //   <setCanRunQuery(!parsedQuery.parseError)
  // }, [parsedQuery, setCanRunQuery])

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

  const processFilter = useCallback((f: GrafanaField<any>): Field => {
        let contingency: FieldContingency = {};
        f.values.forEach((value: string, i: number) => {
          if (!contingency[value]) {
            contingency[value] = {
              count: 0,
              pinned: false,
              active: builder.parsedQuery ? !!builder.parsedQuery.findFilter(f.name, `${value}`) : false
            }
          }
          contingency[value].count += 1;  
          if (i === row.rowIndex) {
            contingency[value].pinned = true;
          }
        });
        return { name: f.name, contingency };
  },[builder.parsedQuery, row.rowIndex])

  const filteredFields = useMemo(() => {
    const searchableFieldsNames = fields.map(f=>f.text);
    return row.dataFrame.fields
      .filter(f=>searchableFieldsNames.includes(f.name))
      // exclude some low-filterability fields
      .filter((f)=> isPrimitive(f.type))
      // sort fields by name
      .sort((f1, f2)=> (f1.name>f2.name ? 1 : -1))
      .map(processFilter)

  }, [row, fields, processFilter]);

  const toggleFilter = (filter: Filter): void => {
    // Compute mutation to apply to the query and send to parent
    // check if that filter is in the query
    if (!builder.parsedQuery) { return; }

    const newParsedQuery = (
      builder.parsedQuery.hasFilter(filter.name, filter.value)
        ? builder.parsedQuery.removeFilter(filter.name, filter.value)
        : builder.parsedQuery.addFilter(filter.name, filter.value)
    )

    if (newParsedQuery) {
      setParsedQuery(newParsedQuery)
    }
  }

  return (
    <div className={logContextUiStyle}>
      <DatasourceContext.Provider value={props.datasource}>
        <LogContextQueryBuilderSidebar fields={filteredFields} onToggleFilter={toggleFilter}/>
        <div className={css`width:100%; display:flex; flex-direction:column; gap:0.5rem; min-width:0;`}>
          {ActionBar}
          <LuceneQueryEditor
            placeholder="Shift-Enter to run the query, Ctrl-Space to autocomplete"
            value={builder.query}
            autocompleter={getSuggestions}
            onChange={builder.setQuery}
            onSubmit={runQuery}
            />
        </div>
      </DatasourceContext.Provider>
    </div>
  );
}
