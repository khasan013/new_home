const DHAKA_TIME_ZONE = 'Asia/Dhaka';

function getDhakaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DHAKA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);

  const valueFor = (type) => Number(parts.find((part) => part.type === type).value);

  return {
    year: valueFor('year'),
    month: valueFor('month'),
    day: valueFor('day'),
  };
}

function isFirstDayInDhaka(now = new Date()) {
  return getDhakaDateParts(now).day === 1;
}

function isLastDayInDhaka(now = new Date()) {
  const { year, month, day } = getDhakaDateParts(now);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day === lastDay;
}

module.exports = {
  DHAKA_TIME_ZONE,
  getDhakaDateParts,
  isFirstDayInDhaka,
  isLastDayInDhaka,
};
