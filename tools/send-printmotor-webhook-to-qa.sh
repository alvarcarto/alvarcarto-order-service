#!/bin/bash

curl -XPOST -H"content-type: application/json" -d@docs/printmotor-webhook-example.json https://order-api-qa.alvarcarto.com/api/webhooks/printmotor