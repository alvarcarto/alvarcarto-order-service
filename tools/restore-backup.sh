#!/bin/bash

if [ -z "$1" ]
then
  echo "Usage: ./restore-backup.sh <encrypted-dump-file>"
  exit 1
fi

if [ -n "$2" ]
then
  echo "Usage: ./restore-backup.sh <encrypted-dump-file>"
  exit 1
fi

DESTINATION_DB='postgresql://alvar:alvar@localhost:5432/alvarcarto_dump_test'

echo "Decrypting file $1 .."
gpg --output decrypted.dump --decrypt "$1"

echo "Restoring PG dump .."
pg_restore --no-owner --verbose --clean --no-acl -Fc -d "$DESTINATION_DB" decrypted.dump

echo "Removing temporary decrypted file .."
rm decrypted.dump

echo "Done. Backup restored to $DESTINATION_DB"
