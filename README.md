# Quickwit data source for Grafana

The Quickwit data source plugin allows you to query and visualize Quickwit data from within Grafana.

**This is currently a work in progress and should be available at the end of May 2023. Stay tuned!**

## Version compatibility

Grafana v9.x is highly recommended as the data source was only tested on this version.

## Installation

For detailed instructions on how to install the plugin on Grafana Cloud or locally, please checkout the [Plugin installation docs](https://grafana.com/docs/grafana/latest/administration/plugin-management/).


## Configuration

### With Grafana UI

### With a configuration file


```yaml
apiVersion: 1

datasources:
  - name: Quickwit
    type: quickwit
    database: 'my-index'
    url: http://localhost:7280/api/v1
    jsonData:
      timeField: timestamp
      logMessageField: message
      logLevelField: fields.level
```

## Development

### Prerequisites

You need:
- [Docker and compose](https://docs.docker.com/compose/install/)
- [Node.js](https://nodejs.org/en/download)
- [yarn](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable)
- [golang](https://go.dev/doc/install)
- [Mage](https://magefile.org/)
- A Quickwit instance running locally

### Building

#### Frontend

```bash
$ yarn install
$ yarn build
```

When developing the front, use `yarn dev`.

#### Backend

```bash
$ mage -v
```

### Start Grafana
  
```bash
$ docker-compose up grafana
```

### Testing

#### Frontend

```bash
$ npm run test
```

#### Backend

```bash
$ go test -v ./pkg/...
```
