#!/usr/bin/env node

// Sends an email to a customer(s)
// Usage:
// node tools/send-email.js <template> <title> <sql-query>

const BPromise = require('bluebird');
const _ = require('lodash');
const Mustache = require('mustache');
const { table } = require('table');
const inquirer = require('inquirer');
const { knex } = require('../src/util/database');
const { sendEmailAsync, createReceiptTemplateModel } = require('../src/core/email-core');
const { readFileSync } = require('../src/util');
const { selectOrders } = require('../src/core/order-core');

if (process.argv.length < 5) {
  console.error('\nIncorrect parameters');
  console.error('Usage: ./send-email.js <template> <title> <sql-query>');
  process.exit(2);
}

// Logs a nice table from array of objects, e.g. knex rows
function consoleTable(arr) {
  const keys = _.keys(arr[0]);
  const newArr = _.map(arr, obj => _.map(keys, key => obj[key]));

  const fullTable = [keys].concat(newArr);
  console.log(table(fullTable, {
    columns: {
      0: {
        width: 40,
      },
    },
  }));
}

function prettyPrintOrders(orders) {
  const printableOrders = _.map(orders, (order) => {
    return {
      orderId: order.orderId,
      email: order.email,
      createdAt: order.createdAt.toISOString(),
      cartItems: order.cart.length,
    };
  });

  consoleTable(printableOrders);
}

function main() {
  const templateName = process.argv[2];
  const emailTitle = process.argv[3];
  const sqlQuery = process.argv[4];

  const textTemplate = readFileSync(`email-templates/${templateName}.txt`);
  const htmlTemplate = readFileSync(`email-templates/${templateName}.html`);

  return selectOrders({ addQuery: sqlQuery })
    .tap((orders) => {
      prettyPrintOrders(orders);

      console.log('\n\About to send real email to the people above!');
      return inquirer.prompt([{
        type: 'confirm',
        message: 'Continue?',
        name: 'confirm',
        default: false,
      }])
        .then(({ confirm }) => {
          if (!confirm) {
            const err = new Error('User cancelled');
            err.code = 'CANCEL';
            throw err;
          }
        });
    })
    .then((orders) => {
      return BPromise.mapSeries(orders, (order) => {
        console.log('Sending email to', order.email, '..');

        const templateModel = createReceiptTemplateModel(order);
        return sendEmailAsync({
          From: 'help@alvarcarto.com',
          To: order.email,
          Subject: Mustache.render(emailTitle, templateModel),
          TextBody: Mustache.render(textTemplate, templateModel),
          HtmlBody: Mustache.render(htmlTemplate, templateModel),
        });
      });
    })
    .catch((err) => {
      if (err.code === 'CANCEL') {
        return;
      }

      console.log('Error:', err);
      throw err;
    })
    .finally(() => knex.destroy());
}

main();
