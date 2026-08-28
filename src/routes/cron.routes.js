const express = require('express');
const { processMonthlyBills } = require('../services/billService');
const { resetMonthlyWorkingData } = require('../services/monthlyReset');
const { isFirstDayInDhaka, isLastDayInDhaka } = require('../utils/dhakaCalendar');

const router = express.Router();

const requireCronSecret = (req, res, next) => {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = String(req.headers.authorization || '');
  const bearerToken = authorization.replace(/^Bearer\s+/i, '');
  const providedSecret = req.headers['x-cron-secret'] || req.query.secret || bearerToken;

  if (!configuredSecret) {
    return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  }

  if (providedSecret !== configuredSecret) {
    return res.status(401).json({ message: 'Unauthorized cron request' });
  }

  return next();
};

router.get('/monthly-bills', requireCronSecret, async (req, res) => {
  try {
    if (!isLastDayInDhaka()) {
      return res.json({ message: 'Skipped: it is not the last day of the month in Asia/Dhaka' });
    }
    const result = await processMonthlyBills({ force: req.query.force === 'true' });
    res.json({
      message: `Monthly bill processing done for ${result.period.month}`,
      ...result,
    });
  } catch (err) {
    console.error('Monthly bill processing failed:', err);
    res.status(500).json({
      message: 'Monthly bill processing failed',
      error: err.message,
    });
  }
});

router.get('/reset-month', requireCronSecret, async (req, res) => {
  try {
    if (!isFirstDayInDhaka()) {
      return res.json({ message: 'Skipped: it is not the first day of the month in Asia/Dhaka' });
    }
    console.log('Running monthly reset...');

    const resetResult = await resetMonthlyWorkingData();

    res.json({
      message: 'Monthly reset done (Meals + Expenses + Penalties + Bills)',
      reset: resetResult,
    });
  } catch (err) {
    console.error('Monthly reset failed:', err);
    res.status(500).json({
      message: 'Reset failed',
      error: err.message,
    });
  }
});

module.exports = router;
