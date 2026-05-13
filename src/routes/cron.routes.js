const express = require('express');
const Meal = require('../models/Meal');
const Expense = require('../models/Expense');
const Penalty = require('../models/Penalty'); // 🔥 ADD THIS

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

// 🔥 Monthly reset route
router.get('/reset-month', requireCronSecret, async (req, res) => {
  try {
    console.log('🔥 Running monthly reset...');

    // ⚠️ OPTION 1 (your current system)
    await Meal.deleteMany({});
    await Expense.deleteMany({});
    await Penalty.deleteMany({}); // 🔥 FIX: reset penalties also

    res.json({ message: 'Monthly reset done ✅ (Meals + Expenses + Penalties)' });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Reset failed',
      error: err.message
    });
  }
});

module.exports = router;
