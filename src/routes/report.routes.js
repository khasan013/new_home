// routes/report.routes.js
const express = require('express');
const Meal    = require('../models/Meal');
const Expense = require('../models/Expense');
const auth    = require('../middleware/auth');

const router = express.Router();

router.get('/:homeId', auth, async (req, res) => {
  try {
    const homeId = req.params.homeId;

    const [mealTotals, expenseTotals] = await Promise.all([
      Meal.aggregate([
        { $match: { homeId: Meal.schema.path('homeId').cast(homeId) } },
        { $group: { _id: null, totalMeals: { $sum: '$mealCount' } } }
      ]),
      Expense.aggregate([
        { $match: { homeId: Expense.schema.path('homeId').cast(homeId) } },
        { $group: { _id: null, totalExpense: { $sum: '$amount' } } }
      ])
    ]);

    const totalExpense = expenseTotals[0]?.totalExpense || 0;
    const totalMeals   = mealTotals[0]?.totalMeals || 0;
    const perMeal      = totalMeals ? totalExpense / totalMeals : 0;

    res.json({ totalExpense, totalMeals, perMeal });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate report', error: err.message });
  }
});

module.exports = router;
