# Quickwit data source for Grafana

<img alt="Grafana Explorer Screenshot" src="src/img/screenshot-explorer-view-with-query.png" width="400" ><img alt="Grafana Dashboard Screenshot" src="src/img/screenshot-dashboard-view.png" width="400" >

The Quickwit data source plugin allows you to query and visualize Quickwit data from within Grafana.

It is available for installation directly from the
[Grafana catalog](https://grafana.com/grafana/plugins/quickwit-quickwit-datasource/)
or you can download the latest version and follow the
[installation guide](#installation).

## Special thanks and a note on the license

This plugin is **heavily** inspired by the `elasticsearch` plugin available on the [Grafana repository](https://github.com/grafana/). First of all, huge thanks to the Grafana team for open-sourcing all their work.

It's more or less a fork of this plugin to adapt the code to Quickwit API. See [LICENSING](LICENSING.md) for details on the license and the changes made.

The license for this project is [AGPL-3.0](LICENSE.md), and a [notice](NOTICE.md) was added to respect the Grafana Labs license.

## Version compatibility

We recommand Grafana v9.5 or v10.

Quickwit 0.6 is compatible with 0.2.x versions only.

Quickwit 0.7 is compatible with 0.3.x versions only.


## Installation

You can either download the plugin manually and unzip it into the plugin directory or use the env variable `GF_INSTALL_PLUGINS` to install it.

### 0.3.2 for Quickwit 0.7

Run `grafana-oss` container with the env variable:

```bash
docker run -p 3000:3000 -e GF_INSTALL_PLUGINS="https://github.com/quickwit-oss/quickwit-datasource/releases/download/v0.3.2/quickwit-quickwit-datasource-0.3.2.zip;quickwit-quickwit-datasource" grafana/grafana-oss run
```

Or download the plugin manually and start Grafana

```bash
wget https://github.com/quickwit-oss/quickwit-datasource/releases/download/v0.3.2/quickwit-quickwit-datasource-0.3.2.zip
mkdir -p plugins
unzip quickwit-quickwit-datasource-0.3.2.zip -d plugins/quickwit-quickwit-datasource-0.3.2
docker run -p 3000:3000 -e GF_PATHS_PLUGINS=/data/plugins -v ${PWD}/plugins:/data/plugins grafana/grafana-oss run
```

### 0.2.4 for Quickwit 0.6


```bash
docker run -p 3000:3000 -e GF_INSTALL_PLUGINS="https://github.com/quickwit-oss/quickwit-datasource/releases/download/v0.2.4/quickwit-quickwit-datasource-0.2.4.zip;quickwit-quickwit-datasource" grafana/grafana-oss run
```

## Additional instructions

If you are running a local Quickwit instance on Linux, add the `--network=host` argument to the `docker run` command. This will allow Grafana to access services on the host machine. You can later use `http://localhost:7280/api/v1` in the Quickwit API URL when configuring the data source.

The default username and password are `admin` and `admin`.

You're all set!

### Plugins management

For detailed instructions on how to install plugins on Grafana Cloud or
locally, please check out the [Plugin management docs](https://grafana.com/docs/grafana/latest/administration/plugin-management/).

## Configuration

To configure the Quickwit datasource, you need to provide the following information:
- The Quickwit API URL with the `/api/v1` suffix. If you have a Quickwit local instance, set the host to `http://host.docker.internal:7280/api/v1` on macOS or `http://localhost:7280/api/v1` on Linux.
- The index name.
- The log message field name (optional). This is the field displayed in the explorer view.
- The log level field name (optional). It must be a fast field.
  
### With Grafana UI

Follow [these instructions](https://grafana.com/docs/grafana/latest/administration/data-source-management/) to add a new Quickwit data source, and enter configuration options.

### With a configuration file

```yaml
apiVersion: 1

datasources:
  - name: Quickwit
    type: quickwit-quickwit-datasource
    url: http://localhost:7280/api/v1
    jsonData:
      index: 'hdfs-logs'
      logMessageField: body
      logLevelField: severity_text
```

## Features

- Explore view.
- Dashboard view.
- Template variables.
- Adhoc filters.
- Explore Log Context.
- [Alerting](https://grafana.com/docs/grafana/latest/alerting/).


## Contributing to Quickwit datasource

Details on our [contributing guide](CONTRIBUTING.md).
