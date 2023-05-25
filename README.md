# Quickwit data source for Grafana

<img alt="Grafana Explorer Screenshot" src="src/img/screenshot-explorer-view-with-query.png" width="400" ><img alt="Grafana Dashboard Screenshot" src="src/img/screenshot-dashboard-view.png" width="400" >

The Quickwit data source plugin allows you to query and visualize Quickwit data from within Grafana.

**The plugin is not yet signed by the Grafana team and is not yet available on the Grafana catalog. In the meantime, you can download the latest version and follow the [installation guide](#installation)!**

## Version compatibility

Grafana v9.5 is recommended as the data source was only tested on this version.

## Installation

### Download the latest release (0.1.0)

```bash
curl https://github.com/quickwit-oss/quickwit-datasource/releases/download/v0.1.0/quickwit-quickwit-datasource-0.1.0.zip
```

### Start Grafana with the plugin

```bash
mkdir -p grafana-storage/plugins
unzip quickwit-quickwit-datasource-0.1.0.zip -d grafana/plugins
docker run --rm -p 3000:3000 -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=quickwit-quickwit-datasource -v ${PWD}/grafana-storage:/var/lib/grafana --name grafana-enterprise grafana/grafana-enterprise
```

If you want to bypass the authentication, add the following environment variables to the `docker run` command:

```bash
docker run --rm -p 3000:3000 \
-e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=quickwit-quickwit-datasource \
-e GF_AUTH_DISABLE_LOGIN_FORM=true \
-e GF_AUTH_ANONYMOUS_ENABLED=true \
-e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
-v ${PWD}/grafana-storage:/var/lib/grafana \
--name grafana-enterprise grafana/grafana-enterprise
```

You're all set!

### Plugins management

For detailed instructions on how to install plugins on Grafana Cloud or
locally, please check out the [Plugin management docs](https://grafana.com/docs/grafana/latest/administration/plugin-management/).

## Configuration

To configure the Quickwit datasource, you need to provide the following information:
- The Quickwit API URL with the `/api/v1` suffix.
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
