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

* `bash ./tools/reset-database.sh`

  If this doesn't work, you can manually run SQL commands from ./tools/init-database.sql
  in Postgres console.

* `cp .env.sample .env`
* Fill in the blanks in `.env`
* `source .env` or `bash .env`

  Or use [autoenv](https://github.com/kennethreitz/autoenv).

* `npm install`
* `npm install -g knex`
* `knex migrate:latest` Run migrations to local database
* `knex seed:run` Create seed data to local database
* `npm start` Start express server locally
* Server runs at http://localhost:3001

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
