import React from "react";
import { useTheme2, CollapsableSection, Icon } from '@grafana/ui';
import { css, cx } from "@emotion/css";
import { Field } from "../types";
import { Filter } from "LogContext/types";


function LogContextFieldSection(field: Field) { 
  const theme = useTheme2()
  const hasActiveFilters = Object.entries(field.contingency).map(([_,entry])=>!!entry.active).reduce((a,b)=>a || b, false);
  return(
    <span className={css({fontSize:theme.typography.body.fontSize, display:"flex", alignItems: "baseline", gap:"0.5rem", width:"100%"})}>
      {hasActiveFilters && <Icon name={"filter"} className={css({ color:theme.colors.primary.text })}/>}
      <span>{field.name}</span>
    </span>
  )
}

type FieldItemProps = {
  label: any,
  contingency: {
    count: number,
    pinned: boolean
  },
  active?: boolean,
  onClick: () => void
}

function LogContextFieldItem(props: FieldItemProps){
  const theme = useTheme2()
  const lcAttributeItemStyle = css({
    display: "flex",
    justifyContent: "space-between",
    paddingLeft: "10px",
    fontSize: theme.typography.bodySmall.fontSize,
    "&[data-active=true]": {
      backgroundColor: theme.colors.primary.transparent,
    },
    "&:hover": {
      backgroundColor: theme.colors.secondary.shade,
    }
  });

  const formatLabel = (value: any)=> {
    let shouldEmphasize = false;
    let label = `${value}`;

    if (value === null || value === '' || value === undefined){
      shouldEmphasize = true;
    }
    if (value === '') {
      label = '<empty string>'
    }
    return (shouldEmphasize ? <em>{label}</em> : label);
  }
  
  return (
    <a className={lcAttributeItemStyle} onClick={props.onClick} data-active={props.active}>
      <span className={css`text-overflow:ellipsis; min-width:0; flex:1 1`}>{ formatLabel(props.label) }</span>
      <span className={css`flex-grow:0`}>{props.contingency.pinned && <Icon name={"crosshair"}/>}{props.contingency.count}</span>
    </a>
  )
}

const lcSidebarStyle = css`
  width: 300px;
  min-width: 300px;
  flex-shrink: 0;
  overflow-y: scroll;
  padding-right: 1rem;
`

type QueryBuilderProps = {
  fields: Field[] 
  onToggleFilter?: (filter: Filter) => void
}

export function LogContextQueryBuilderSidebar(props: QueryBuilderProps) {

  const renderFieldSection = (field: Field)=>{
    return (
      <CollapsableSection
            label={LogContextFieldSection(field)} 
            className={css`& > div { flex-grow:1; }` } 
            isOpen={false} key="log-attribute-field-{field.name}" 
            contentClassName={cx(css`margin:0; padding:0`)}>
        <div className={css`display:flex; flex-direction:column; gap:5px`}>

          {field.contingency && Object.entries(field.contingency)
            .sort(([na, ca], [nb, cb])=>(cb.count - ca.count))
            .map(([fieldValue, contingency], i) => (
              <LogContextFieldItem
                label={fieldValue} contingency={contingency} key={`field-opt${i}`}
                onClick={() => {props.onToggleFilter && props.onToggleFilter({name:field.name, value:fieldValue})}}
                active={contingency.active}
                />
            ))
          }
        </div>
      </CollapsableSection>
    )
  }

  return (
    <div className={lcSidebarStyle}>
      {props.fields && props.fields.map((field) => {
        return( renderFieldSection(field) );
      }) } </div>
  );
}
