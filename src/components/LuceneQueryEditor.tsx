import React, { useRef, useCallback } from "react";
import { debounceTime } from 'rxjs';
import { useObservableCallback, useSubscription } from 'observable-hooks'
import { css } from "@emotion/css";


import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import {linter, Diagnostic, lintGutter} from "@codemirror/lint"
import {autocompletion, CompletionContext} from "@codemirror/autocomplete"
import { LuceneQuery } from "utils/lucene";


export type LuceneQueryEditorProps = {
  placeholder?: string,
  value: string,
  autocompleter: (word: string) => any,
  onChange: (query: string) => void
}

export function LuceneQueryEditor(props: LuceneQueryEditorProps){
  const editorRef = useRef<ReactCodeMirrorRef|null>(null)

  const queryLinter =  linter( view => {
    let diagnostics: Diagnostic[] = [];
    const query = LuceneQuery.parse(view.state.doc.toString())
    const error = query.parseError
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
  }, [autocompleter])


  const autocomplete = autocompletion({ override: [datasourceCompletions] })

  const [onChange, textChanged$] = useObservableCallback<string>(event$ => event$.pipe(debounceTime(1000)))

  useSubscription(textChanged$, props.onChange)

  return (<CodeMirror 
    ref={editorRef}
    className={css`height:100%`} // XXX : need to set height for both wrapper elements
    height="100%"
    theme={'dark'} 
    placeholder={props.placeholder}
    value={props.value}
    onChange={onChange}
    extensions={[queryLinter, lintGutter(), autocomplete]}
    />);
}
