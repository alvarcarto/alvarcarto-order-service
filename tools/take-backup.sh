#!/bin/bash

set -x
set -e

DESTINATION_DIR='/Users/kbru/Google Drive/alvarcarto/order-api-pg-dumps'
DATE=$(date "+%Y-%m-%d")

DESTINATION="$DESTINATION_DIR/alvarcarto-order-prod-pg-$DATE.dump"

echo "Taking postgres dump from prod .. "
pg_dump --no-owner --no-acl -Fc $(heroku config:get DATABASE_URL -a alvarcarto-order-prod) > "$DESTINATION"

echo "Encrypting file with GPG .. "
gpg -c "$DESTINATION"

echo "Removing unencrypted file .. "
rm "$DESTINATION"

echo "Database dump saved at $DESTINATION_DIR"

