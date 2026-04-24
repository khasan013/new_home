const express = require('express');
const Meal = require('../models/Meal');
const Expense = require('../models/Expense');

const router = express.Router();

// 🔥 Monthly reset route
router.get('/reset-month', async (req, res) => {
  try {
    console.log('🔥 Running monthly reset...');

    // ⚠️ OPTION 1 (your current system)
    await Meal.deleteMany({});
    await Expense.deleteMany({});

    res.json({ message: 'Monthly reset done ✅' });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Reset failed',
      error: err.message
    });
  }
});

module.exports = router;