import React, { useEffect, useMemo, useState } from "react";
// import { Field } from '@grafana/data';
import { useTheme2, CollapsableSection, Icon } from '@grafana/ui';
import { LogContextProps } from "./LogContextUI";
import { css, cx } from "@emotion/css";
import { LuceneQuery } from "utils/lucene";
import { LuceneQueryBuilder } from '@/QueryBuilder/lucene';


// TODO : define sensible defaults here
const excludedFields = [
  '_source',
  'sort',
  'attributes',
  'attributes.message',
  'body',
  'body.message',
  'resource_attributes',
  'observed_timestamp_nanos',
  'timestamp_nanos',
];

function isPrimitive(valT: any) {
  return ['string', 'number', "boolean", "undefined"].includes(valT)
}

type FieldContingency = { [value: string]: {
  count: number, pinned: boolean, active?: boolean
}};
type Field = {
  name: string,
  contingency: FieldContingency
}

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
  builder: LuceneQueryBuilder,
  searchableFields: any[],
  updateQuery: (query: LuceneQuery) => void
}

export function LogContextQueryBuilderSidebar(props: LogContextProps & QueryBuilderProps) {

  const {row, builder, updateQuery, searchableFields} = props;
  const [fields, setFields] = useState<Field[]>([]);

  const filteredFields = useMemo(() => {
    const searchableFieldsNames = searchableFields.map(f=>f.text);
    return row.dataFrame.fields
      .filter(f=>searchableFieldsNames.includes(f.name))
      // exclude some low-filterability fields
      .filter((f)=> !excludedFields.includes(f.name) && isPrimitive(f.type))
      // sort fields by name
      .sort((f1, f2)=> (f1.name>f2.name ? 1 : -1))
  }, [row, searchableFields]);

  useEffect(() => {
    const fields = filteredFields
      .map((f) => {
        const contingency: FieldContingency = {};
        f.values.forEach((value, i) => {
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
      })

    setFields(fields);
  }, [filteredFields, row.rowIndex, builder.parsedQuery]);


  const selectQueryFilter = (key: string, value: string): void => {
    // Compute mutation to apply to the query and send to parent
    // check if that filter is in the query
    if (!builder.parsedQuery) { return; }

    const newParsedQuery = (
      builder.parsedQuery.hasFilter(key, value)
        ? builder.parsedQuery.removeFilter(key, value)
        : builder.parsedQuery.addFilter(key, value)
    )

    if (newParsedQuery) {
      updateQuery(newParsedQuery);
    }
  }

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
                onClick={() => {selectQueryFilter(field.name, fieldValue)}}
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
      {fields && fields.map((field) => {
        return( renderFieldSection(field) );
      }) } </div>
  );
}
