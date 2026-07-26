const cron = require('node-cron');
const { resetMonthlyWorkingData } = require('../services/monthlyReset');

cron.schedule('30 0 1 * *', async () => {
  console.log('Monthly data reset started...');
  try {
    const result = await resetMonthlyWorkingData();
    console.log('Monthly data reset completed:', result);
  } catch (error) {
    console.error('Monthly data reset failed:', error);
  }
}, { timezone: 'Asia/Dhaka' });

console.log('Monthly reset cron registered (1st day of every month at 12:30 AM Asia/Dhaka)');
