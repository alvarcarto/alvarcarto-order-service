'use strict';
var Joi = require('joi');
var assignIn = require('lodash/assignIn');
var find = require('lodash/find');
var defaults = require('lodash/defaults');
var ValidationError = require('./express-validation-validation-error');

var defaultOptions = {
  contextRequest: false,
  allowUnknownHeaders: true,
  allowUnknownBody: true,
  allowUnknownQuery: true,
  allowUnknownParams: true,
  allowUnknownCookies: true,
  status: 400,
  statusText: 'Bad Request'
};
var globalOptions = {};

// maps the corresponding request object to an `express-validation` option
var unknownMap = {
  headers: 'allowUnknownHeaders',
  body: 'allowUnknownBody',
  query: 'allowUnknownQuery',
  params: 'allowUnknownParams',
  cookies: 'allowUnknownCookies'
};

module.exports.joiValidate = function (obj, schema) {
  var errors = [];

  // Set default options
  var options = defaults({}, schema.options || {}, globalOptions, defaultOptions);

  validate(errors, obj, schema);
  if (errors && errors.length === 0) {
    return;
  }

  throw new ValidationError(errors, options);
};

exports.ValidationError = ValidationError;

exports.options = function (opts) {
  if (!opts) {
    globalOptions = {};
    return;
  }

  globalOptions = defaults({}, globalOptions, opts);
};

/**
 * validate checks the current `Request` for validations
 * NOTE: mutates `request` in case the object is valid.
 */
function validate (errObj, obj, schema) {
  if (!obj || !schema) return;

  var joiOptions = {
    abortEarly: false,
  };

  Joi.validate(obj, schema, joiOptions, function (errors, value) {
    if (!errors || errors.details.length === 0) {
      //assignIn(request, value); // joi responses are parsed into JSON
      return;
    }

    errors.details.forEach(function (error) {
      var errorExists = find(errObj, function (item) {
        if (item && item.field === error.path && item.location === location) {
          item.messages.push(error.message);
          item.types.push(error.type);
          return item;
        }
        return;
      });

      if (!errorExists) {
        errObj.push({
          field: error.path,
          messages: [error.message],
          types: [error.type]
        });
      }
    });
  });
};
