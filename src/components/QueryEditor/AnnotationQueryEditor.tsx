import React from 'react';

import { AnnotationQuery } from '@grafana/data';
import { Input, InlineField, InlineFieldRow } from '@grafana/ui';

import { ElasticsearchQuery } from '@/types';

import { ElasticQueryEditorProps, ElasticSearchQueryField } from './index';

type Props = ElasticQueryEditorProps & {
  annotation?: AnnotationQuery<ElasticsearchQuery>;
  onAnnotationChange?: (annotation: AnnotationQuery<ElasticsearchQuery>) => void;
};

export function ElasticsearchAnnotationsQueryEditor(props: Props) {
  const annotation = props.annotation!;
  const onAnnotationChange = props.onAnnotationChange!;

  return (
    <>
      <div className="gf-form-group">
        <ElasticSearchQueryField
          value={annotation.target?.query}
          onChange={(query) => {
            const currentTarget = annotation.target ?? { refId: 'annotation_query' };
            const newTarget = {
              ...currentTarget,
              query,
            };

            onAnnotationChange({
              ...annotation,
              target: newTarget,
            });
          }}
          // XXX : ain't used at the moment, fix the build
          onSubmit={()=>null}
        />
      </div>

      <div className="gf-form-group">
        <h6>Field mappings</h6>
        <InlineFieldRow>
          <InlineField label="Time">
            <Input
              type="text"
              placeholder="@timestamp"
              value={annotation.timeField}
              onChange={(e) => {
                onAnnotationChange({
                  ...annotation,
                  timeField: e.currentTarget.value,
                });
              }}
            />
          </InlineField>
          <InlineField label="Time End">
            <Input
              type="text"
              value={annotation.timeEndField}
              onChange={(e) => {
                onAnnotationChange({
                  ...annotation,
                  timeEndField: e.currentTarget.value,
                });
              }}
            />
          </InlineField>
          <InlineField label="Text">
            <Input
              type="text"
              value={annotation.textField}
              onChange={(e) => {
                onAnnotationChange({
                  ...annotation,
                  textField: e.currentTarget.value,
                });
              }}
            />
          </InlineField>
          <InlineField label="Tags">
            <Input
              type="text"
              placeholder="tags"
              value={annotation.tagsField}
              onChange={(e) => {
                onAnnotationChange({
                  ...annotation,
                  tagsField: e.currentTarget.value,
                });
              }}
            />
          </InlineField>
        </InlineFieldRow>
      </div>
    </>
  );
}
