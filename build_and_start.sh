#!/usr/bin/env bash

npm install
npm run build
mage -v
go test -v ./pkg/...
docker-compose up --build --force-recreate
