const cron = require('node-cron');
const { processMonthlyBills } = require('../services/billService');

cron.schedule('1 0 1 * *', async () => {
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
  timezone: 'Asia/Dhaka',
});

console.log('Monthly bill cron registered (1st day of every month at 12:01 AM Asia/Dhaka)');

