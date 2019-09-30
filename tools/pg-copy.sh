#!/bin/bash

set -e

if [ -z "$1" ]
then
  echo "Error: missing the first database url"
  echo "Usage: ./pg-copy.sh postgres://user:pass@host/db1 postgres://user:pass@host/db2"
  exit 1
fi

if [ -z "$2" ]
then
echo "Error: missing the second database url"
  echo "Usage: ./pg-copy.sh postgres://user:pass@host/db1 postgres://user:pass@host/db2"
  exit 1
fi

DB1=$1
DB2=$2

# Split the string with '/' character and take the last item
DB2_NAME=$(echo "$DB2" | grep -o '[^/]*$')
DB2_BASE_PART=$(echo "postgres://alvar:alvar@127.0.0.1:4001/alvar_order" | grep -o '^.*/')
DB2_DEFAULT_DB_URL="$(echo $DB2_BASE_PART)postgres"

bold=$(tput bold)
normal=$(tput sgr0)

if ! echo "$DB2" | grep -q -E '^postgres://[A-Za-z0-9_]+:[A-Za-z0-9_]+@[A-Za-z0-9_.:]+/[A-Za-z0-9_]+$'
then
  echo "Error: second database url does not match the expected url pattern: ^postgres://[A-Za-z0-9_]+:[A-Za-z0-9_]+@[A-Za-z0-9_.:]+/[A-Za-z0-9_]+$"
  echo "Postgres URL should be in format: postgres://user:pass@host/db_name but got $DB2"
  exit 2
fi

echo "Copying data:"
echo -e "$DB1 -> $DB2\n"
echo "WARNING: THIS OPERATION ${bold}WILL DELETE${normal} ALL DATA IN DATABASE NAMED ${bold}$DB2_NAME${normal} at ${bold}$DB2_DEFAULT_DB_URL${normal}"
read -p "Do you want to continue? [y/N] "
echo    # (optional) move to a new line
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
  # handle exits from shell or function but don't exit interactive shell
  [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1
fi

# pg_dump options explained:
# -F custom
#    Specify format of the archive. The archive is in the custom format of pg_dump.
# --no-acl
#    Prevent dumping of access privileges (grant/revoke commands).
#    This is needed when the dbs are owned by different named users,
#    which usually is the case
# --no-owner
#    Do not output commands to set ownership of objects to match the original database.
#    This is needed when the dbs are owned by different named users,
#    which usually is the case
#
# pg_restore options:
# --clean
#    Clean (drop) database objects before recreating them.

echo "Running DROP DATABASE IF EXISTS \"$DB2_NAME\"; .."
psql -d "$DB2_DEFAULT_DB_URL" -c "DROP DATABASE IF EXISTS \"$DB2_NAME\";"

echo "Running 01-init-local-dev-db.sql .."
psql -d "$DB2_DEFAULT_DB_URL" -f tools/docker-postgres/01-init-local-dev-db.sql

echo "Copying .."
pg_dump --no-owner --no-acl -F custom "$DB1" | pg_restore -F custom --clean -d "$DB2_DEFAULT_DB_URL"


