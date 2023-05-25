# Contributing to Quickwit datasource

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


## Release

TODO
