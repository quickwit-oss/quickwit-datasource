import React, { useRef, useCallback } from "react";
import { css } from "@emotion/css";

import { LuceneQueryBuilder } from '@/QueryBuilder/lucene';

import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import {linter, Diagnostic, lintGutter} from "@codemirror/lint"
import {autocompletion, CompletionContext} from "@codemirror/autocomplete"


export type LuceneQueryEditorProps = {
  placeholder?: string,
  builder: LuceneQueryBuilder,
  autocompleter: (word: string) => any,
  onChange: (query: string) => void
}

export function LuceneQueryEditor(props: LuceneQueryEditorProps){
  const editorRef = useRef<ReactCodeMirrorRef|null>(null)

  const queryLinter =  linter( view => {
    let diagnostics: Diagnostic[] = [];

    const error = props.builder.parsedQuery?.parseError
    if (error) {
      diagnostics.push({
        severity: "error",
        message: error.message,
        from: view.state.doc.line(error.location.start.line).from + error.location.start.column -1,
        to: view.state.doc.line(error.location.end.line).from + error.location.end.column -1,
      }) ;
    }
    return diagnostics
  })


  const {autocompleter} = props;
  const datasourceCompletions = useCallback(async (context: CompletionContext)=>{
    let word = context.matchBefore(/\S*/);
    if (!word){ return null }
    const suggestions = await autocompleter(word?.text);
    return {
      from: word.from + suggestions.from,
      options: suggestions.options
    }
  },[autocompleter])


  const autocomplete = autocompletion({ override: [datasourceCompletions] })

  return (<CodeMirror 
    ref={editorRef}
    className={css`height:100%`} // XXX : need to set height for both wrapper elements
    height="100%"
    theme={'dark'} 
    placeholder={props.placeholder}
    value={props.builder.query}
    onChange={props.onChange}
    extensions={[queryLinter, lintGutter(), autocomplete]}
    />);
}
