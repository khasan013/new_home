// routes/report.routes.js
const express = require('express');
const Meal    = require('../models/Meal');
const Expense = require('../models/Expense');
const auth    = require('../middleware/auth');
const { requireHomeMember } = require('../utils/homeAccess');

const router = express.Router();

router.get('/:homeId', auth, async (req, res) => {
  try {
    const homeId = req.params.homeId;
    await requireHomeMember(homeId, req.user.userId);

    const [mealTotals, expenseTotals] = await Promise.all([
      Meal.aggregate([
        { $match: { homeId: Meal.schema.path('homeId').cast(homeId) } },
        {
          $group: {
            _id: null,
            totalMeals: { $sum: '$mealCount' },
            totalEggsConsumed: { $sum: '$eggsCount' },
          }
        }
      ]),
      Expense.aggregate([
        { $match: { homeId: Expense.schema.path('homeId').cast(homeId) } },
        { $group: { _id: null, totalExpense: { $sum: '$amount' } } }
      ])
    ]);

    const totalExpense = expenseTotals[0]?.totalExpense || 0;
    const totalMeals   = mealTotals[0]?.totalMeals || 0;
    const totalEggsConsumed = mealTotals[0]?.totalEggsConsumed || 0;
    const perMeal      = totalMeals ? totalExpense / totalMeals : 0;

    res.json({ totalExpense, totalMeals, perMeal, totalEggsConsumed });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate report' });
  }
});

module.exports = router;
