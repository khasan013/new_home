const express = require('express');
const Expense = require('../models/Expense');
const Meal = require('../models/Meal');
const Penalty = require('../models/Penalty');
const { processMonthlyBills } = require('../services/billService');

const router = express.Router();

const requireCronSecret = (req, res, next) => {
  const configuredSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-cron-secret'] || req.query.secret;

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
    console.log('Running monthly reset...');

    const billResult = await processMonthlyBills();

    await Meal.deleteMany({});
    await Expense.deleteMany({});
    await Penalty.deleteMany({});

    res.json({
      message: 'Monthly reset done (Bills + Meals + Expenses + Penalties)',
      bills: billResult,
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
