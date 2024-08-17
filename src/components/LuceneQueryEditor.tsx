import React, { useRef, useCallback } from "react";
import { css } from "@emotion/css";


import CodeMirror, { ReactCodeMirrorRef, keymap } from '@uiw/react-codemirror';
import {linter, Diagnostic, lintGutter} from "@codemirror/lint"
import {autocompletion, CompletionContext} from "@codemirror/autocomplete"
import { LuceneQuery } from "@/utils/lucene";


export type LuceneQueryEditorProps = {
  placeholder?: string,
  value: string,
  autocompleter: (word: string) => any,
  onChange: (query: string) => void
  onSubmit: (query: string) => void
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
    let suggestions;
    let word = context.matchBefore(/\S*/);
    if (!word){ return null }
      suggestions = await autocompleter(word?.text);
    if (suggestions && suggestions.options.length > 0 ) {
      // Fixes autocompletion inserting an extra quote when the cursor is before a quote
      const cursorIsBeforeQuote = context.state.doc.toString().slice(context.pos, context.pos + 1) === '"';
      if (cursorIsBeforeQuote) {
        suggestions.options = suggestions.options.map(o => ({...o, apply: `${o.label.replace(/"$/g, '')}`}));
      }

      return {
        from: word.from + suggestions.from,
        options: suggestions.options
      }
    }
    return null
  }, [autocompleter])


  const autocomplete = autocompletion({
    override: [datasourceCompletions],
    activateOnTyping: false,
  })

  return (<CodeMirror
    ref={editorRef}
    className={css`height:100%`} // XXX : need to set height for both wrapper elements
    height="100%"
    theme={'dark'}
    placeholder={props.placeholder}
    value={props.value}
    onChange={props.onChange}
    indentWithTab={false}
    extensions={[
      queryLinter, lintGutter(),
      autocomplete,
      keymap.of([{key:'Shift-Enter', run:(target)=>{
        props.onSubmit(target.state.doc.toString())
        return true;
      }}])
    ]}
    />);
}
