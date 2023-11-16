#!/usr/bin/env bash

npm install
npm run build
mage -v
docker-compose up --build --force-recreate
