#!/bin/bash
set -x
set -e

docker-compose down
docker volume rm postgres
docker-compose up -d
bash tools/pg-copy.sh $(heroku config:get DATABASE_URL -a alvarcarto-order-qa) $(grep DATABASE_URL .env | cut -d '=' -f2)
