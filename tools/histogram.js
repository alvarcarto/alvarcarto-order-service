// Fork from https://github.com/jstrace/bars
// supports more sorting options

/**
 * Module dependencies.
 */

var fmt = require('printf');

/**
 * Expose `histogram()`.
 */

module.exports = histogram;

/**
 * Return ascii histogram of `data`.
 *
 * @param {Object} data
 * @param {Object} [opts]
 * @return {String}
 * @api public
 */

function histogram(data, opts) {
  opts = opts || {};

  // options

  var width = opts.width || 60;
  var barc = opts.bar || '#';
  var map = opts.map || noop;
  var sortDirection = opts.sortDirection || 'desc';

  // normalize data

  var data = toArray(data);
  if (opts.sort === 'keys' && sortDirection === 'desc') {
    data = data.sort(descendingKeys);
  } else if (opts.sort === 'keys' && sortDirection === 'asc') {
    data = data.sort(ascendingKeys);
  } else if (opts.sort === 'values' && sortDirection === 'desc') {
    data = data.sort(descendingValues);
  } else if (opts.sort === 'values' && sortDirection === 'asc') {
    data = data.sort(ascendingValues);
  } else if (opts.sort) {
    data = data.sort(descendingValues);
  }

  var maxKey = max(data.map(function(d){ return d.key.length }));
  var maxVal = max(data.map(function(d){ return d.val })) || width;
  var maxValLabel = max(data.map(function(d){ return String(d.val).length }));
  var str = '';

  // blah blah histo

  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var p = d.val / maxVal;
    var shown = Math.round(width * p);
    var blank = width - shown
    var bar = Array(shown + 1).join(barc);
    // XXX: This assumes that keys are numeric
    var aggregateCount = data.reduce((memo, item) => {
      // Add float epsilon
      if (Number(item.key) <= Number(d.key) + 0.0000000001) {
        return memo + item.val
      }
      return memo
    }, 0)
    var totalCount = data.reduce((memo, item) => memo + item.val, 0)
    var percentage = (aggregateCount / totalCount * 100).toFixed(1)
    bar += Array(blank + 1).join(' ');
    str += fmt('  %*s | %s | %*s  %s %%\n', d.key, maxKey, bar, map(d.val), maxValLabel, percentage);
  }

  return str;
}

/**
 * Sort descending.
 */

function descendingKeys(a, b) {
  return Number(b.key) - Number(a.key);
}

function ascendingKeys(a, b) {
  return Number(a.key) - Number(b.key);
}

function descendingValues(a, b) {
  return b.val - a.val;
}

function ascendingValues(a, b) {
  return a.val - b.val;
}


/**
 * Return max in array.
 */

function max(data) {
  var n = data[0];

  for (var i = 1; i < data.length; i++) {
    n = data[i] > n ? data[i] : n;
  }

  return n;
}

/**
 * Turn object into an array.
 */

function toArray(obj) {
  return Object.keys(obj).map(function(key){
    return {
      key: key,
      val: obj[key]
    }
  })
}

/**
 * Noop map function.
 */

function noop(val) {
  return val;
}