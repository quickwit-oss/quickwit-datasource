import { DataFrame, DataLink, DataQueryRequest, DataQueryResponse } from "@grafana/data";
import { getDataSourceSrv } from "@grafana/runtime";
import { BaseQuickwitDataSource } from './base';
import { DataLinkConfig, ElasticsearchQuery } from "../types";

export function getQueryResponseProcessor(datasource: BaseQuickwitDataSource, request: DataQueryRequest<ElasticsearchQuery>) {
  return {
    processResponse: (response: DataQueryResponse) => {
      response.data.forEach((dataFrame) => {
        const metrics = request.targets[0].metrics;
        if (metrics && metrics[0].type === 'logs') {
          processLogsDataFrame(datasource, dataFrame);
        }
      });
      return response;
    }
  };
}

export function processLogsDataFrame(datasource: BaseQuickwitDataSource, dataFrame: DataFrame) {
  // Ignore log volume dataframe, no need to add links.
  if (!dataFrame.refId || dataFrame.refId.startsWith('log-volume')) {
    return;
  }
  // Skip empty dataframes
  if (dataFrame.length===0 || dataFrame.fields.length === 0) {
    return;
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
    field.config.links = [...(field.config.links || []), ...linksToApply.map(generateDataLink)];
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
