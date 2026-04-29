import { DataFrame, DataLink, DataQueryRequest, DataQueryResponse, Field, FieldType } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { BaseQuickwitDataSource } from './base';
import { DataLinkConfig, ElasticsearchQuery } from '../types';

export function getQueryResponseProcessor(
  datasource: BaseQuickwitDataSource,
  request: DataQueryRequest<ElasticsearchQuery>
) {
  return {
    processResponse: (response: DataQueryResponse) => {
      response.data.forEach((dataFrame) => {
        const metrics = request.targets[0].metrics;
        if (metrics && metrics[0].type === 'logs') {
          processLogsDataFrame(datasource, dataFrame);
        }
      });
      return response;
    },
  };
}
function getCustomFieldName(fieldname: string) {
  return `$qw_${fieldname}`;
}

const OTEL_MESSAGE_FIELDS = ['body.message', 'attributes.message'];
const TRACE_ID_FIELDS = ['trace_id', 'traceID', 'traceId', 'attributes.trace_id'];
const QUICKWIT_DATASOURCE_TYPE = 'quickwit-quickwit-datasource';

const SKIP_FIELD_PREFIXES = [
  'attributes.pod_',
  'attributes.node_labels.',
  'attributes.namespace_labels.',
  'attributes.container_image',
  'attributes.pod_owner',
];
const SKIP_FIELD_NAMES = new Set(['sort', 'severity_text', 'body.stream']);

function isMetadataField(name: string, timeField: string): boolean {
  if (name === timeField || SKIP_FIELD_NAMES.has(name)) {
    return true;
  }
  return SKIP_FIELD_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function stripPrefix(name: string): string {
  if (name.startsWith('attributes.')) {
    return name.slice('attributes.'.length);
  }
  if (name.startsWith('body.')) {
    return name.slice('body.'.length);
  }
  return name;
}

function buildFallbackMessage(dataFrame: DataFrame, rowIdx: number, timeFieldName: string): string {
  for (const candidate of OTEL_MESSAGE_FIELDS) {
    const field = dataFrame.fields.find((f) => f.name === candidate);
    if (field) {
      const val = field.values[rowIdx];
      if (val != null && val !== '') {
        return String(val);
      }
    }
  }

  const parts: string[] = [];
  for (const field of dataFrame.fields) {
    if (isMetadataField(field.name, timeFieldName) || field.type === FieldType.time) {
      continue;
    }
    const val = field.values[rowIdx];
    if (val != null && val !== '') {
      parts.push(`${stripPrefix(field.name)}=${val}`);
    }
  }
  return parts.join(' ');
}

export function processLogsDataFrame(datasource: BaseQuickwitDataSource, dataFrame: DataFrame) {
  // Ignore log volume dataframe, no need to add links or a displayed message field.
  if (!dataFrame.refId || dataFrame.refId.startsWith('log-volume')) {
    return;
  }
  // Skip empty dataframes
  if (dataFrame.length === 0 || dataFrame.fields.length === 0) {
    return;
  }

  const configuredFields = datasource.logMessageField ? datasource.logMessageField.split(',') : [];
  const field_idx_list: number[] = [];
  for (const messageField of configuredFields) {
    const field_idx = dataFrame.fields.findIndex((field) => field.name === messageField);
    if (field_idx !== -1) {
      field_idx_list.push(field_idx);
    }
  }

  const timeFieldName = dataFrame.fields.find((f) => f.type === FieldType.time)?.name ?? '';
  const displayedMessages = Array(dataFrame.length);

  for (let idx = 0; idx < dataFrame.length; idx++) {
    let displayedMessage = '';

    if (field_idx_list.length === 1) {
      displayedMessage = `${dataFrame.fields[field_idx_list[0]].values[idx] ?? ''}`;
    } else if (field_idx_list.length > 1) {
      for (const field_idx of field_idx_list) {
        displayedMessage += ` ${dataFrame.fields[field_idx].name}=${dataFrame.fields[field_idx].values[idx]}`;
      }
      displayedMessage = displayedMessage.trim();
    }

    if (!displayedMessage) {
      displayedMessage = buildFallbackMessage(dataFrame, idx, timeFieldName);
    }

    displayedMessages[idx] = displayedMessage;
  }

  const newField: Field = {
    name: getCustomFieldName('message'),
    type: FieldType.string,
    config: {},
    values: displayedMessages,
  };
  const [timestamp, ...rest] = dataFrame.fields;
  dataFrame.fields = [timestamp, newField, ...rest];

  addLogToTraceLink(datasource, dataFrame);

  if (!datasource.dataLinks.length) {
    return;
  }

  for (const field of dataFrame.fields) {
    const linksToApply = datasource.dataLinks.filter((dataLink) => dataLink.field === field.name);

    if (linksToApply.length === 0) {
      continue;
    }

    field.config = field.config || {};
    appendFieldLinks(field, linksToApply.map(generateDataLink));
  }
}

function addLogToTraceLink(datasource: BaseQuickwitDataSource, dataFrame: DataFrame) {
  const traceIDField = dataFrame.fields.find((field) => TRACE_ID_FIELDS.includes(field.name));
  if (!traceIDField) {
    return;
  }

  const datasourceUid = datasource.tracesDatasourceUid || datasource.uid;
  if (!datasourceUid) {
    return;
  }

  const datasourceName = getDatasourceName(
    datasourceUid,
    datasource.tracesDatasourceName || datasource.name || 'Quickwit traces'
  );

  appendFieldLinks(traceIDField, [
    {
      title: 'Open trace',
      url: '',
      internal: {
        datasourceUid,
        datasourceName,
        query: {
          refId: 'A',
          query: 'trace_id:${__value.raw}',
          queryType: 'traces',
          datasource: {
            type: QUICKWIT_DATASOURCE_TYPE,
            uid: datasourceUid,
          },
          bucketAggs: [],
          filters: [],
          metrics: [
            {
              id: '1',
              type: 'traces',
              settings: { limit: '10000' },
            },
          ],
        },
      },
    },
  ]);
}

function appendFieldLinks(field: Field, links: DataLink[]) {
  field.config = field.config || {};
  field.config.links = [...(field.config.links || []), ...links];
}

function getDatasourceName(datasourceUid: string, fallback: string): string {
  try {
    return getDataSourceSrv().getInstanceSettings(datasourceUid)?.name ?? fallback;
  } catch {
    return fallback;
  }
}

function generateDataLink(linkConfig: DataLinkConfig): DataLink {
  if (linkConfig.datasourceUid) {
    return {
      title: linkConfig.urlDisplayLabel || '',
      url: '',
      internal: {
        query: { query: linkConfig.url },
        datasourceUid: linkConfig.datasourceUid,
        datasourceName: getDatasourceName(linkConfig.datasourceUid, 'Data source not found'),
      },
    };
  } else {
    return {
      title: linkConfig.urlDisplayLabel || '',
      url: linkConfig.url,
    };
  }
}
