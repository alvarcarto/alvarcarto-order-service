const _ = require('lodash');
const holidays = require('finnish-holidays-js');
const businessMoment = require('moment-business-time');

function pad(str) {
  return _.padStart(str, 2, '0');
}

const currentYear = (new Date()).getFullYear();
const years = _.range(currentYear - 1, currentYear + 5);
const arrOfArrs = _.map(years, y => holidays.year(y));
const allYearsHolidays = _.flatten(_.map(arrOfArrs, (singleYearHolidays) => {
  return _.map(singleYearHolidays, obj => `${obj.year}-${pad(obj.month)}-${pad(obj.day)}`);
}));

businessMoment.updateLocale('fi', {
  workinghours: {
    0: null,
    1: ['09:00:00', '17:00:00'],
    2: ['09:00:00', '17:00:00'],
    3: ['09:00:00', '17:00:00'],
    4: ['09:00:00', '17:00:00'],
    5: ['09:00:00', '17:00:00'],
    6: null,
  },
  holidays: allYearsHolidays,
});
businessMoment.locale('fi');

function diffInWorkingDays(moment1, moment2) {
  // true boolean flag means that the result can be fractional day like 4.1
  return businessMoment(moment1).workingDiff(businessMoment(moment2), 'days', true);
}

module.exports = {
  diffInWorkingDays,
};
