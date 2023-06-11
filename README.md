# Quickwit data source for Grafana

<img alt="Grafana Explorer Screenshot" src="src/img/screenshot-explorer-view-with-query.png" width="400" ><img alt="Grafana Dashboard Screenshot" src="src/img/screenshot-dashboard-view.png" width="400" >

The Quickwit data source plugin allows you to query and visualize Quickwit data from within Grafana.

**The plugin is not yet signed by the Grafana team and is not yet available on the Grafana catalog. In the meantime, you can download the latest version and follow the [installation guide](#installation)!**

## Special thanks and a note on the license

This plugin is heavily inspired by the `elasticsearch` plugin available on the [Grafana repository](https://github.com/grafana/). So first of all, huge thanks to the Grafana team for open-sourcing all their work.

Also, we choose to put the plugin under `AGPL-3.0` as the Grafana repository is under this same license.


## Version compatibility

Grafana v9.5 is recommended as the data source was only tested on this version.

## Installation

### Download the latest release (0.2.0)

```bash
wget https://github.com/quickwit-oss/quickwit-datasource/releases/download/v0.1.0/quickwit-quickwit-datasource-0.2.0.zip
```

### Unzip into the plugins directory

```bash
mkdir -p grafana-storage/plugins
unzip quickwit-quickwit-datasource-0.2.0.zip -d grafana-storage/plugins
```

### Start Grafana

```bash
docker run --rm -p 3000:3000 \
-e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=quickwit-quickwit-datasource \
-e GF_AUTH_DISABLE_LOGIN_FORM=true \
-e GF_AUTH_ANONYMOUS_ENABLED=true \
-e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
-v ${PWD}/grafana-storage:/var/lib/grafana \
--name grafana-enterprise grafana/grafana-enterprise
```

If you are running a local Quickwit instance on Linux, add the `--network=host` argument to the `docker run` command. This will allow Grafana to access services on the host machine. You can later use `http://localhost:7280/api/v1` in the Quickwit API URL when configuring the data source.

If you want to keep the authentication, remove environment variables `GF_AUTH_DISABLE_LOGIN_FORM`, `GF_AUTH_ANONYMOUS_ENABLED` and `GF_AUTH_ANONYMOUS_ORG_ROLE`.

You're all set!

### Plugins management

For detailed instructions on how to install plugins on Grafana Cloud or
locally, please check out the [Plugin management docs](https://grafana.com/docs/grafana/latest/administration/plugin-management/).

## Configuration

To configure the Quickwit datasource, you need to provide the following information:
- The Quickwit API URL with the `/api/v1` suffix. If you have a Quickwit local instance, set the host to `http://host.docker.internal:7280/api/v1` on macOS or `http://localhost:7280/api/v1` on Linux.
- The index name.
- The timestamp field name.
- The output format of the timestamp field: only `unix_timestamp_secs`, `unix_timestamp_millis`, `unix_timestamp_micros`, `unix_timestamp_nanos`, `iso8601` and `rfc3339` are supported.
- The log message field name (optional). This is the field displayed in the explorer view.
- The log level field name (optional). It must be a fast field.
  
### With Grafana UI

Follow [these instructions](https://grafana.com/docs/grafana/latest/administration/data-source-management/) to add a new Quickwit data source, and enter configuration options.

### With a configuration file

```yaml
apiVersion: 1

datasources:
  - name: Quickwit
    type: quickwit
    database: 'hdfs-logs'
    url: http://localhost:7280/api/v1
    jsonData:
      timeField: timestamp
      timeOutputFormat: unix_timestamp_secs
      logMessageField: body
      logLevelField: severity_text
```

## Learn more

* Set up alerting; refer to [Alerts overview](https://grafana.com/docs/grafana/latest/alerting/).


## Contributing to Quickwit datasource

Details on our [contributing guide](CONTRIBUTING.md).
