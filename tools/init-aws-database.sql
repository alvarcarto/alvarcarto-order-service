-- Remove this from your local ~/.psql_history after running
CREATE USER 'dashboard'@'%' WITH PASSWORD '<INSERT_40_CHAR_PASS_HERE>';

CREATE DATABASE order_qa lc_collate 'en_US.UTF-8' lc_ctype 'en_US.UTF-8' encoding 'UTF8' template template0;
GRANT ALL PRIVILEGES ON DATABASE order_qa to dashboard;
