// routes/expense.routes.js
const express = require('express');
const Expense = require('../models/Expense');
const auth    = require('../middleware/auth');

const router = express.Router();

router.post('/:homeId', auth, async (req, res) => {
  try {
    const expense = await Expense.create({
      homeId: req.params.homeId,
      title:  req.body.title,
      amount: req.body.amount,
      paidBy: req.user.userId,

      // 🔥 FIX (ADD THESE)
      category: req.body.category,
      eggQty: req.body.eggQty || 0,
    });

    res.json(expense);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create expense', error: err.message });
  }
});

router.get('/:homeId', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 0, 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const query = Expense.find({ homeId: req.params.homeId })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    if (limit) query.limit(limit).skip(skip);

    const expenses = await query;

    if (limit) {
      return res.json({
        data: expenses,
        pagination: {
          limit,
          skip,
          nextSkip: expenses.length === limit ? skip + limit : null
        }
      });
    }

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch expenses', error: err.message });
  }
});

router.delete('/:homeId/:expId', auth, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.expId,
      homeId: req.params.homeId
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete expense', error: err.message });
  }
});

module.exports = router;
