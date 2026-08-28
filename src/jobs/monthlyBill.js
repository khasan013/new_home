const cron = require('node-cron');
const { processMonthlyBills } = require('../services/billService');

cron.schedule('30 23 28-31 * *', async () => {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
  });
  const today = dayFormatter.format(now);
  const tomorrow = dayFormatter.format(new Date(now.getTime() + (24 * 60 * 60 * 1000)));
  if (today === tomorrow) return;

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

console.log('Monthly bill cron registered (last day of every month at 11:30 PM Asia/Dhaka)');
