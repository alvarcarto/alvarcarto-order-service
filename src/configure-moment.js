const moment = require('moment');
const momentTimezone = require('moment-timezone');

// Update calendar locale. Thought behind this format is to be precise, but still have the
// convenience (last week etc.). Also it uses the 24h clock which is more common in Finland
//
// Nov 22nd 2018 at 14:59
// Nov 26th 2018 at 14:59 (Last week)
// Nov 29th 2018 at 14:59 (Last week)
// Dec 1st 2018 at 14:59 (Yesterday)
// Dec 2nd 2018 at 14:59 (Today)
// Dec 3rd 2018 at 14:59 (Tomorrow)
// Dec 5th 2018 at 14:59 (Next week)
// Dec 12th 2018 at 14:59
const locale = {
  parentLocale: 'en',
  calendar: {
    lastDay: 'LLL [(Yesterday)]',
    sameDay: 'LLL [(Today)]',
    nextDay: 'LLL [(Tomorrow)]',
    lastWeek: 'LLL [(Last week)]',
    nextWeek: 'LLL [(Next week)]',
    sameElse: 'LLL',
  },
  // moment docs:
  // 'You can eliminate the lowercase l tokens and they will be created automatically by
  // replacing long tokens with the short token variants.'
  longDateFormat: {
    LT: 'HH:mm',
    LLL: 'MMMM Do [at] LT',
  },
};
moment.defineLocale('en-custom', locale);
momentTimezone.defineLocale('en-custom', locale);

// Set to en
moment.locale('en');
