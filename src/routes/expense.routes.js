const express = require('express');
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');
const { requireHomeMember } = require('../utils/homeAccess');

const router = express.Router();
const VALID_CATEGORIES = ['Grocery', 'Egg', 'SharedBill', 'WaterSupply'];
const EQUAL_SPLIT_CATEGORIES = ['SharedBill', 'WaterSupply'];

function toPositiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function cleanExpensePayload(body) {
  const category = VALID_CATEGORIES.includes(body.category) ? body.category : 'Grocery';
  const bottlePrice = toPositiveNumber(body.bottlePrice);
  const bottleQty = toPositiveNumber(body.bottleQty);
  const amount = category === 'WaterSupply'
    ? bottlePrice * bottleQty
    : toPositiveNumber(body.amount);

  return {
    title: String(body.title || (category === 'WaterSupply' ? 'Drinking water supply' : '')).trim(),
    amount,
    category,
    eggQty: category === 'Egg' ? toPositiveNumber(body.eggQty) : 0,
    splitEqually: EQUAL_SPLIT_CATEGORIES.includes(category),
    bottlePrice: category === 'WaterSupply' ? bottlePrice : 0,
    bottleQty: category === 'WaterSupply' ? bottleQty : 0,
  };
}

function validatePayload(payload) {
  if (!payload.title) return 'Title is required';
  if (payload.amount <= 0) return 'Amount must be greater than 0';
  if (payload.category === 'Egg' && payload.eggQty <= 0) return 'Egg quantity must be greater than 0';
  if (payload.category === 'WaterSupply' && (payload.bottlePrice <= 0 || payload.bottleQty <= 0)) {
    return 'Bottle price and quantity must be greater than 0';
  }
  return '';
}

router.post('/:homeId', auth, async (req, res) => {
  try {
    await requireHomeMember(req.params.homeId, req.user.userId);
    const payload = cleanExpensePayload(req.body);
    const validationError = validatePayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const expense = await Expense.create({
      homeId: req.params.homeId,
      paidBy: req.user.userId,
      ...payload,
    });

    res.json(expense);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to create expense' });
  }
});

router.get('/:homeId', auth, async (req, res) => {
  try {
    await requireHomeMember(req.params.homeId, req.user.userId);

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
          nextSkip: expenses.length === limit ? skip + limit : null,
        },
      });
    }

    res.json(expenses);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to fetch expenses' });
  }
});

router.put('/:homeId/:expId', auth, async (req, res) => {
  try {
    await requireHomeMember(req.params.homeId, req.user.userId);
    const payload = cleanExpensePayload(req.body);
    const validationError = validatePayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.expId, homeId: req.params.homeId },
      payload,
      { new: true, runValidators: true }
    );

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json(expense);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to update expense' });
  }
});

router.delete('/:homeId/:expId', auth, async (req, res) => {
  try {
    await requireHomeMember(req.params.homeId, req.user.userId);

    const expense = await Expense.findOneAndDelete({
      _id: req.params.expId,
      homeId: req.params.homeId,
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to delete expense' });
  }
});

module.exports = router;
