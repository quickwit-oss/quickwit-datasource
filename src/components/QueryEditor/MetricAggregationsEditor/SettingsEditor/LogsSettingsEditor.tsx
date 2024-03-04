import { css } from "@emotion/css";
import { RadioButtonGroup } from "@grafana/ui";
import React from "react";
import { Logs, LogsSortDirection, LogsEnd } from "types";
import { SettingField } from "./SettingField";
import { useDispatch } from "hooks/useStatelessReducer";
import { changeMetricSetting } from '../state/actions';
import { metricAggregationConfig } from "../utils";


// type LogsSortDirection = 'asc' | 'desc'

interface Props { metric: Logs }

export const LogsSettingsEditor = ({metric}: Props)=>{
  const config = metricAggregationConfig['logs']
  const dispatch = useDispatch();
  return (
    <div className={css({display:"inline-flex", justifyContent:"start", gap:"4px", height:"100%"})} >
      <RadioButtonGroup 
        className={css({height:"100%"})}
        options={Object.values(LogsSortDirection).map((v)=>({label:LogsEnd[v], value:v}))}
        value={metric.settings?.sortDirection || config.defaults.settings?.sortDirection }
        onChange={(v)=>{ dispatch(
            changeMetricSetting({ metric, settingName: 'sortDirection', newValue: v })
          )}}/>
      <SettingField label="Limit" metric={metric} settingName="limit" placeholder={config.defaults.settings?.limit} />
    </div>
  )

}
