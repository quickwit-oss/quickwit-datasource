
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
