// routes/report.routes.js
const express = require('express');
const Meal    = require('../models/Meal');
const Expense = require('../models/Expense');
const auth    = require('../middleware/auth');

const router = express.Router();

router.get('/:homeId', auth, async (req, res) => {
  try {
    const meals    = await Meal.find({ homeId: req.params.homeId });
    const expenses = await Expense.find({ homeId: req.params.homeId });

    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalMeals   = meals.reduce((sum, m) => sum + m.mealCount, 0);
    const perMeal      = totalMeals ? totalExpense / totalMeals : 0;

    res.json({ totalExpense, totalMeals, perMeal });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate report', error: err.message });
  }
});

module.exports = router;
