import { DataFrame, DataLink, DataQueryRequest, DataQueryResponse, Field, FieldType } from "@grafana/data";
import { getDataSourceSrv } from "@grafana/runtime";
import { BaseQuickwitDataSource } from './base';
import { DataLinkConfig, ElasticsearchQuery, Logs } from "../types";

export function getQueryResponseProcessor(datasource: BaseQuickwitDataSource, request: DataQueryRequest<ElasticsearchQuery>) {
  return {
    processResponse: (response: DataQueryResponse) => {
      response.data.forEach((dataFrame) => {
        const metrics = request.targets[0].metrics;
        if (metrics && metrics[0].type === 'logs') {
          const logsMetric = metrics[0] as Logs;
          const selectedFields = logsMetric.settings?.selectedFields;
          processLogsDataFrame(datasource, dataFrame, selectedFields);
        }
      });
      return response;
    }
  };
}
function getCustomFieldName(fieldname: string) { return `$qw_${fieldname}`; }
export function processLogsDataFrame(datasource: BaseQuickwitDataSource, dataFrame: DataFrame, selectedFields?: string[]) {
  // Ignore log volume dataframe, no need to add links or a displayed message field.
  if (!dataFrame.refId || dataFrame.refId.startsWith('log-volume')) {
    return;
  }
  // Skip empty dataframes
  if (dataFrame.length===0 || dataFrame.fields.length === 0) {
    return;
  }
  if (datasource.logMessageField) {
    const messageFields = datasource.logMessageField.split(',');
    let field_idx_list = [];
    for (const messageField of messageFields) {
      const field_idx = dataFrame.fields.findIndex((field) => field.name === messageField);
      if (field_idx !== -1) {
        field_idx_list.push(field_idx);
      }
    }
    const displayedMessages = Array(dataFrame.length);
    for (let idx = 0; idx < dataFrame.length; idx++) {
      let displayedMessage = "";
      // If we have only one field, we assume the field name is obvious for the user and we don't need to show it.
      if (field_idx_list.length === 1) {
        displayedMessage = `${dataFrame.fields[field_idx_list[0]].values[idx]}`;
      } else {
        for (const field_idx of field_idx_list) {
          displayedMessage += ` ${dataFrame.fields[field_idx].name}=${dataFrame.fields[field_idx].values[idx]}`;
        }
      }
      displayedMessages[idx] = displayedMessage.trim();
    }

    const newField: Field = {
      name: getCustomFieldName('message'),
      type: FieldType.string,
      config: {},
      values: displayedMessages,
    };
    const [timestamp, ...rest] = dataFrame.fields;
    dataFrame.fields = [timestamp, newField, ...rest];
  }

  // Filter fields if selectedFields is specified
  if (selectedFields && selectedFields.length > 0) {
    dataFrame.fields = dataFrame.fields.filter((field) => {
      // Always keep the time field, sort field, and custom message field
      if (field.type === FieldType.time || field.name === 'sort' || field.name.startsWith('$qw_')) {
        return true;
      }
      return selectedFields.includes(field.name);
    });
  }

  if (!datasource.dataLinks.length) {
    return;
  }

  for (const field of dataFrame.fields) {
    const linksToApply = datasource.dataLinks.filter((dataLink) => dataLink.field === field.name);

    if (linksToApply.length === 0) {
      continue;
    }

    field.config = field.config || {};
    field.config.links = [...(field.config.links || [], linksToApply.map(generateDataLink))];
  }
}
function generateDataLink(linkConfig: DataLinkConfig): DataLink {
  const dataSourceSrv = getDataSourceSrv();

  if (linkConfig.datasourceUid) {
    const dsSettings = dataSourceSrv.getInstanceSettings(linkConfig.datasourceUid);

    return {
      title: linkConfig.urlDisplayLabel || '',
      url: '',
      internal: {
        query: { query: linkConfig.url },
        datasourceUid: linkConfig.datasourceUid,
        datasourceName: dsSettings?.name ?? 'Data source not found',
      },
    };
  } else {
    return {
      title: linkConfig.urlDisplayLabel || '',
      url: linkConfig.url,
    };
  }
}
