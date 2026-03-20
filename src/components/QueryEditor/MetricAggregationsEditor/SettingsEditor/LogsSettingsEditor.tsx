import { css } from "@emotion/css";
import { RadioButtonGroup, MultiSelect } from "@grafana/ui";
import React from "react";
import { Logs, LogsSortDirection, LogsEnd } from "types";
import { SettingField } from "./SettingField";
import { useDispatch } from "hooks/useStatelessReducer";
import { changeMetricSetting } from '../state/actions';
import { metricAggregationConfig } from "../utils";
import { useDatasource, useRange } from "../../ElasticsearchQueryContext";
import { useDatasourceFields } from "@/datasource/utils";

interface Props { metric: Logs }

export const LogsSettingsEditor = ({metric}: Props) => {
  const config = metricAggregationConfig['logs']
  const dispatch = useDispatch();
  const datasource = useDatasource();
  const range = useRange();
  const { fields } = useDatasourceFields(datasource, range);

  const fieldOptions = fields.map((f) => ({
    label: f.text,
    value: f.text,
  }));

  const selectedFields = metric.settings?.selectedFields ?? [];

  return (
    <div className={css({display:"inline-flex", justifyContent:"start", gap:"4px", height:"100%", flexWrap:"wrap", alignItems:"center"})} >
      <RadioButtonGroup
        className={css({height:"100%"})}
        options={Object.values(LogsSortDirection).map((v)=>({label:LogsEnd[v], value:v}))}
        value={metric.settings?.sortDirection || config.defaults.settings?.sortDirection }
        onChange={(v)=>{ dispatch(
            changeMetricSetting({ metric, settingName: 'sortDirection', newValue: v })
          )}}/>
      <SettingField label="Limit" metric={metric} settingName="limit" placeholder={config.defaults.settings?.limit} />
      <div className={css({display:"inline-flex", alignItems:"center", gap:"4px", minWidth:"200px"})}>
        <label className={css({whiteSpace:"nowrap", fontSize:"12px"})}>Fields</label>
        <MultiSelect
          options={fieldOptions}
          value={selectedFields}
          onChange={(selected) => {
            dispatch(
              changeMetricSetting({
                metric,
                settingName: 'selectedFields',
                newValue: selected.map((s) => s.value),
              })
            );
          }}
          placeholder="All fields"
          isClearable
          allowCustomValue
        />
      </div>
    </div>
  )
}
