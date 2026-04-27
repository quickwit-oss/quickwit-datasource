
# Quickwit data source for Grafana

The Quickwit data source plugin allows you to query and visualize logs, traces, and indexed data in Quickwit within Grafana.

## Requirements
You need a Quickwit standalone server or cluster.

## Configuration
1. Add a new data source in Grafana
2. Select the Quickwit data source plugin
3. Enter your Quickwit server URL
4. Enter your index ID and related information.
5. Save and test the datasource.

## Features
The Quickwit data source plugin works with dashboards and explore views.
Alerts are also available.

### Logs and traces

The query editor supports logs, trace search, full trace view, and raw data queries.

For OpenTelemetry traces, use:

- **Trace search** to find traces from matching spans.
- **Traces** to open a single trace by `trace_id`.

Trace results include span events, span status, exception stack traces, service names, service tags, span tags, and service node graph frames.

When logs and traces are stored in separate Quickwit indexes, create one Quickwit datasource per index and configure the related datasource fields:

- On the logs datasource, set the traces datasource used by log-to-trace links.
- On the traces datasource, set the logs datasource used by trace-to-logs links.

Log-to-trace links are added for log fields named `trace_id`, `traceID`, `traceId`, or `attributes.trace_id`. Trace-to-logs links query logs with both `trace_id` and `span_id`.

## Installation

### Installation on Grafana Cloud

For more information, visit the docs on [plugin installation](https://grafana.com/docs/grafana/latest/plugins/installation/).

### Installation with Grafana CLI

```
grafana-cli plugins install quickwit-quickwit-datasource
```

### Installation with Docker

1. Add the plugin to your `docker-compose.yml` or `Dockerfile`
2. Set the environment variable `GF_INSTALL_PLUGINS` to include the plugin

```
GF_INSTALL_PLUGINS="quickwit-quickwit-datasource"
```
