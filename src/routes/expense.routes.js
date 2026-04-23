const express = require('express'); // ✅ FIX: was missing
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/:homeId', auth, async (req, res) => {
  try { // ✅ FIX: added try/catch
    const expense = await Expense.create({
      homeId: req.params.homeId,
      title: req.body.title,
      amount: req.body.amount,
      paidBy: req.user.userId
    });

    res.json(expense);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create expense', error: err.message });
  }
});

router.get('/:homeId', auth, async (req, res) => {
  try { // ✅ FIX: added try/catch
    const expenses = await Expense.find({ homeId: req.params.homeId });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch expenses', error: err.message });
  }
});

module.exports = router;
