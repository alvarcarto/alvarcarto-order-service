#!/bin/bash

set -x
set -e

APP_NAME=alvarcarto-order-prod
DESTINATION_DIR='/Users/kbru/Google Drive/alvarcarto/order-api-pg-dumps'
DATE=$(date "+%Y-%m-%dT%H%M")

FILE_NAME="$APP_NAME-pg-$DATE.dump"
DESTINATION="$DESTINATION_DIR/$FILE_NAME"

echo "Making a temp working dir .. "
# https://unix.stackexchange.com/questions/30091/fix-or-alternative-for-mktemp-in-os-x
TEMP_DIR=`mktemp -d 2>/dev/null || mktemp -d -t 'mytmpdir'`
cd $TEMP_DIR

echo "Taking postgres dump from prod .. "
pg_dump --no-owner --no-acl -Fc $(heroku config:get DATABASE_URL -a $APP_NAME) > postgres.dump

echo "Encrypting file with GPG .. "
gpg -c postgres.dump

echo "Encrypting file with GPG .. "
mv postgres.dump.gpg "$DESTINATION.gpg"

echo "Removing unencrypted file .. "
rm postgres.dump
rm -r "$TEMP_DIR"

echo "Done. Database dump saved at $DESTINATION.gpg"
