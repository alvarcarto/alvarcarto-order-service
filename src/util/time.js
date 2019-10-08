const _ = require('lodash');
const holidays = require('finnish-holidays-js');
// Not sure if this moment is the same object as the moment in this project's package.json
const moment = require('moment-business-time');

function pad(str) {
  return _.padStart(str, 2, '0');
}

const currentYear = (new Date()).getFullYear();
const years = _.range(currentYear - 1, currentYear + 5);
const arrOfArrs = _.map(years, y => holidays.year(y));
const allYearsHolidays = _.flatten(_.map(arrOfArrs, (singleYearHolidays) => {
  return _.map(singleYearHolidays, obj => `${obj.year}-${pad(obj.month)}-${pad(obj.day)}`);
}));

moment.updateLocale('fi', {
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
// It seems updateLocale also changes the global locale, so we want to change it back to en globally
moment.locale('en');

function diffInWorkingDays(moment1, moment2) {
  const newMoment1 = moment1.clone();
  const newMoment2 = moment2.clone();
  // true boolean flag means that the result can be fractional day like 4.1
  return moment(newMoment1)
    .locale('fi')
    .workingDiff(moment(newMoment2).locale('fi'), 'days', true);
}

module.exports = {
  diffInWorkingDays,
};
