#!/usr/bin/env bash

npm install
npm run build
~/go/bin/mage -v
#docker compose up --build --force-recreate
