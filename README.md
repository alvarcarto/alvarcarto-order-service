# Alvar Carto Order Service

This service is the master of customer orders. It receives orders,
charges customer's credit card with a stripe token, saves order details to
database, sends receipt of the order and forwards it to Printmotor for printing.

Service handles sensitive customer data, be careful!

Dependencies:

* Postgres >=9.5
* [Stripe](https://stripe.com)
* [Printmotor API](https://api.printmotor.io/apidocs/index)
* AWS S3 Bucket *(for sending poster images to Printmotor API)*
* Postmark *(sending order confirmations and other transactional email)*
* https://github.com/kimmobrunfeldt/alvarcarto-render-service


## Get started

* Install [Stripe CLI](https://stripe.com/docs/stripe-cli) before continuing.
* `stripe login` and login with your account

    It creates a restricted API key for the Test mode

* Run `npm run stripe` once and copy the secret to STRIPE_WEBHOOK_SECRET in .env and then stop the process

* `bash ./tools/reset-database.sh`

  If this doesn't work, you can manually run SQL commands from ./tools/init-database.sql
  in Postgres console.

* `cp .env.sample .env && cp .env.test.sample .env.test`
* Fill in the blanks in `.env` and `.env.test`
* `source .env` or `bash .env`

  Or use [autoenv](https://github.com/kennethreitz/autoenv).

* `docker-compose up -d` to start docker container (Postgres) in the background
* `npm install`
* `npm install -g knex`
* `knex migrate:latest` Run migrations to local database
* `knex seed:run` Create seed data to local database
* `npm start` Start express server locally
* Server runs at http://localhost:3001

### Useful commands:

* `knex migrate:rollback` to rollback the latest batch of migrations
* `knex migrate:make <name>` to create a new migration file
* `psql postgres://alvar:alvar@localhost:4001/alvar_order` connect to Postgres in docker
* `docker-compose logs -f postgres` to see tailing logs of postgres docker container
* `docker-compose down` to stop docker containers (Postgres)
* Remove all data from Postgres

  ```
  docker-compose down
  docker volume rm postgres
  ```
* Decrypt logs with `cat logfile.log | dcr --key=$(heroku config:get LOG_ENCRYPT_KEY -a alvarcarto-order-prod)`

    Copy paste some encrypted stream first from papertrail to a local file. Note that papertrail might split the encrypted part into two lines and then it won't work.

    See more options at: https://github.com/kimmobrunfeldt/dcr.

## Techstack

* Node.js express app. Architecture explained here https://github.com/kimmobrunfeldt/express-example/
* Written in ES6
* Winston for logging
* Postgres

## Heroku/Cloud env

```bash
#!/bin/bash
heroku addons:create --app alvarcarto-order-prod papertrail
heroku addons:create --app alvarcarto-order-prod heroku-postgresql:hobby-dev
heroku addons:create --app alvarcarto-order-prod newrelic
```

In addition, it needs Postmark.

## Common tasks

### Release

Migrations and seeds are automatically run in Heroku when you deploy via git push.
Migrations are run if knex detects new files in migrations directory.
Seeds must be replayable, they must be upsert operations so they can be run
on each push.

1. Commit changes
2. Check that tests pass, remember to test migrations locally before push
3. Take manual backup of postgres

    `heroku pg:backups capture --app alvarcarto-order-prod`

4. Push changes to production environment:

    ```bash
    git checkout master
    git pull
    git push prod
    ```

    **For testing environments:**

    You can also release a certain local branch. For example releasing from node
    branch to **dev**: `git push dev my-local-branch:master`.

5. Check that the environment responds and logs(Papertrail) look ok.


### Send test "Your order has been shipped" email

First modify the printmotor-webhook-example.json to have correct order id and printmotor id.

Then run:

```
curl -XPOST -H"content-type: application/json" -d@docs/printmotor-webhook-example.json https://order-api-qa.alvarcarto.com/api/webhooks/printmotor
```
