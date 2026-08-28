const cron = require('node-cron');
const { processMonthlyBills } = require('../services/billService');
const { DHAKA_TIME_ZONE, isLastDayInDhaka } = require('../utils/dhakaCalendar');

cron.schedule('30 23 28-31 * *', async () => {
  if (!isLastDayInDhaka()) return;

  console.log('Monthly bill cron started...');

  try {
    const { period, results } = await processMonthlyBills();
    const sentHomes = results.filter(result => !result.skipped && !result.error).length;
    const skippedHomes = results.filter(result => result.skipped).length;
    const failedHomes = results.filter(result => result.error).length;

    console.log(
      `Monthly bills done for ${period.month}: ${sentHomes} sent, ${skippedHomes} skipped, ${failedHomes} failed`
    );
  } catch (err) {
    console.error('Monthly bill cron failed:', err);
  }
}, {
  timezone: DHAKA_TIME_ZONE,
});

console.log('Monthly bill cron registered (last day of every month at 11:30 PM Asia/Dhaka)');
