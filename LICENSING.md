# Licensing

The license for this project is [AGPL-3.0](LICENSE.md).

Specifically, the source code in directories `pkg` and `src` are derived from the Elasticsearch plugin code present in [Grafana repository]([https://](https://github.com/grafana/grafana)) as described below.

## pkg (Go)

The source code in `pkg` is derived from [Grafana repository][pkg/tsdb/elasticsearch](https://github.com/grafana/grafana/tree/main/pkg/tsdb/elasticsearch).

To support the Quickwit API, the following changes were made:
- Remove index pattern code.
- Fix a [bug](https://github.com/quickwit-oss/quickwit-datasource/commit/c09f92128c7198ef0d44eaddf26a8c0b78a5149c) for nested term aggregations.
- Adapt timestamp parsing to Quickwit's format.


## src (TypeScript)

The source code in `src` is derived from [Grafana repository][public/app/plugins/datasource/elasticsearch](https://github.com/grafana/grafana/tree/main/public/app/plugins/datasource/elasticsearch).

To support the Quickwit API, the following changes were made:
- Disable aggregations that Quickwit does not support.
- Remove index pattern related code.
- Remove `LegacyQueryRunner.ts`.
- Remove `tracking.ts`.
- Update the code to make it work outside of Grafana.
