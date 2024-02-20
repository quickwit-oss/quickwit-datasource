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

### All the stack

```shell
./build_and_start.sh
```

#### Frontend

```bash
$ npm install
$ npm run build
```

When developing the front, use `npm run dev`.

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

#### Storybook

```bash
$ npm run storybook
```

## Release

TODO
