const _ = require('lodash');
const BPromise = require('bluebird');
const request = require('request');

/*
  string customer_email
  boolean email_subscription
  DateTime order_paid
  DateTime order_sent_to_production
  json stripe_token_response

  foreign key cart_id
  foreign key billing_address_id
  foreign key ship_to_address_id
*/

function createOrder(order) {
  return knex('orders').insert({

  })
}

module.exports = {
  createOrder,
};
