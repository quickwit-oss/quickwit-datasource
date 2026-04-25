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
    it('inserts synthetic $qw_message field from configured field', () => {
      const ds = makeDatasource({ logMessageField: 'line' });
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000, 2000]),
        makeField('line', FieldType.string, ['hello world', 'goodbye world']),
        makeField('level', FieldType.string, ['info', 'error']),
      ]);

      processLogsDataFrame(ds, df);

      expect(df.fields[0].name).toBe('timestamp');
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

    it('inserts empty $qw_message when configured field does not exist', () => {
      const ds = makeDatasource({ logMessageField: 'nonexistent' });
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('line', FieldType.string, ['hello']),
      ]);

      processLogsDataFrame(ds, df);

      // $qw_message is still inserted but with empty values
      expect(df.fields[1].name).toBe('$qw_message');
      expect(df.fields[1].values[0]).toBe('');
    });
  });

  describe('without logMessageField configured', () => {
    it('does not insert any synthetic field', () => {
      const ds = makeDatasource();
      const df = makeDataFrame([
        makeField('timestamp', FieldType.time, [1000]),
        makeField('attributes.controller', FieldType.string, ['BlogController']),
        makeField('attributes.method', FieldType.string, ['GET']),
      ]);

      processLogsDataFrame(ds, df);

      // No $qw_message field — current behavior is to do nothing
      const fieldNames = df.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('$qw_message');
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

      // Should not have inserted $qw_message
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
