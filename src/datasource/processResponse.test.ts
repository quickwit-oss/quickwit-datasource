import { DataFrame, Field, FieldType } from '@grafana/data';
import { processLogsDataFrame } from './processResponse';

function makeField(name: string, type: FieldType, values: any[]): Field {
  return { name, type, config: {}, values };
}

function makeDataFrame(fields: Field[], refId = 'A'): DataFrame {
  return {
    refId,
    fields,
    length: fields[0]?.values.length ?? 0,
  };
}

function makeDatasource(overrides: { logMessageField?: string; dataLinks?: any[] } = {}) {
  return {
    logMessageField: overrides.logMessageField ?? '',
    dataLinks: overrides.dataLinks ?? [],
  } as any;
}

describe('processLogsDataFrame', () => {
  describe('with logMessageField configured', () => {
    it('uses configured field value', () => {
      const ds = makeDatasource({ logMessageField: 'line' });
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000, 2000]),
        makeField('line', FieldType.string, ['hello world', 'goodbye world']),
        makeField('level', FieldType.string, ['info', 'error']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values).toEqual(['hello world', 'goodbye world']);
    });

    it('joins multiple configured fields with key=value format', () => {
      const ds = makeDatasource({ logMessageField: 'method,path,status' });
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('method', FieldType.string, ['GET']),
        makeField('path', FieldType.string, ['/blog']),
        makeField('status', FieldType.string, ['200']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('method=GET path=/blog status=200');
    });

    it('falls back when configured field does not exist', () => {
      const ds = makeDatasource({ logMessageField: 'nonexistent' });
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('body.message', FieldType.string, ['the real message']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('the real message');
    });

    it('falls back when configured field value is empty for a row', () => {
      const ds = makeDatasource({ logMessageField: 'line' });
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000, 2000]),
        makeField('line', FieldType.string, ['has content', '']),
        makeField('body.message', FieldType.string, ['', 'fallback message']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('has content');
      expect(df.fields[1].values[1]).toBe('fallback message');
    });
  });

  describe('OTEL fallback (no logMessageField)', () => {
    it('picks body.message when present', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('body.message', FieldType.string, ['GET /assets/app.js HTTP/1.1 200']),
        makeField('body.stream', FieldType.string, ['stdout']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('GET /assets/app.js HTTP/1.1 200');
    });

    it('picks attributes.message when body.message is absent', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('attributes.message', FieldType.string, ['SSO user already exists']),
        makeField('attributes.severity', FieldType.string, ['INFO']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('SSO user already exists');
    });

    it('prefers body.message over attributes.message', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('body.message', FieldType.string, ['from body']),
        makeField('attributes.message', FieldType.string, ['from attributes']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('from body');
    });

    it('builds key=value summary when no well-known fields exist', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('attributes.method', FieldType.string, ['GET']),
        makeField('attributes.path', FieldType.string, ['/blog']),
        makeField('attributes.status', FieldType.number, [200]),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('method=GET path=/blog status=200');
    });

    it('strips attributes. prefix in key=value summary', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('attributes.controller', FieldType.string, ['BlogController']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].values[0]).toBe('controller=BlogController');
    });

    it('skips metadata fields in key=value summary', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('attributes.method', FieldType.string, ['GET']),
        makeField('attributes.pod_name', FieldType.string, ['rx-production-abc123']),
        makeField('attributes.node_labels.arch', FieldType.string, ['amd64']),
        makeField('sort', FieldType.other, [[1684398201000]]),
        makeField('severity_text', FieldType.string, ['INFO']),
        makeField('body.stream', FieldType.string, ['stdout']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('method=GET');
    });

    it('handles mixed log types per row', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000, 2000, 3000]),
        makeField('attributes.message', FieldType.string, ['SSO login', '', '']),
        makeField('attributes.method', FieldType.string, ['', 'GET', '']),
        makeField('attributes.path', FieldType.string, ['', '/blog', '']),
        makeField('body.message', FieldType.string, ['', '', 'raw nginx log line']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('SSO login');
      expect(df.fields[1].values[1]).toBe('method=GET path=/blog');
      expect(df.fields[1].values[2]).toBe('raw nginx log line');
    });
  });

  describe('edge cases', () => {
    it('skips empty dataframes', () => {
      const ds = makeDatasource({ logMessageField: 'line' });
      const df = makeDataFrame([]);

      processLogsDataFrame(ds, df);

      expect(df.fields.length).toBe(0);
    });

    it('skips log-volume dataframes', () => {
      const ds = makeDatasource({ logMessageField: 'line' });
      const df = makeDataFrame(
        [
          makeField('timestamp', FieldType.time, [1000]),
          makeField('line', FieldType.string, ['hello']),
        ],
        'log-volume-A'
      );

      processLogsDataFrame(ds, df);

      const fieldNames = df.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('$qw_message');
    });

    it('skips dataframes with no refId', () => {
      const ds = makeDatasource({ logMessageField: 'line' });
      const df: DataFrame = {
        refId: undefined,
        fields: [
          makeField('timestamp', FieldType.time, [1000]),
          makeField('line', FieldType.string, ['hello']),
        ],
        length: 1,
      };

      processLogsDataFrame(ds, df);

      const fieldNames = df.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('$qw_message');
    });
  });
});
