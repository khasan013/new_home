const express = require('express');
const Meal = require('../models/Meal');
const Home = require('../models/Home');
const auth = require('../middleware/auth');

const router = express.Router();

// ✅ Helper: check admin
const isAdmin = (home, userId) => {
  return home.members.some(
    (m) => m.user.toString() === userId && m.role === 'admin'
  );
};

// ─────────────────────────────────────────
// CREATE MEAL
// ─────────────────────────────────────────
router.post('/:homeId', auth, async (req, res) => {
  try {
    const { homeId } = req.params;

    console.log('REQ BODY:', req.body);

    // ✅ Check home exists
    const home = await Home.findById(homeId);
    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    // ✅ Check membership
    const isMember = home.members.some(
      (m) => m.user.toString() === req.user.userId
    );

    if (!isMember) {
      return res.status(403).json({
        message: 'You are not a member of this home'
      });
    }

    // ✅ Safe number parser
    const parseNumber = (val) => {
      if (val === undefined || val === null) return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    // ✅ 🔥 FIXED SAFE DATE PARSE (NO LOGIC CHANGE)
    let date = req.body.date ? new Date(req.body.date) : new Date();

    // ❗ Correct validation
    if (isNaN(date.getTime())) {
      console.error('INVALID DATE RECEIVED:', req.body.date);
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // ✅ Create meal
    const meal = await Meal.create({
      homeId,
      userId: req.user.userId,
      date,
      mealCount: parseNumber(req.body.mealCount),
      eggsCount: parseNumber(req.body.eggsCount),
    });

    res.json(meal);

  } catch (err) {
    console.error('CREATE MEAL ERROR FULL:', err); // 🔥 upgraded log
    res.status(500).json({
      message: 'Failed to create meal',
      error: err.message
    });
  }
});

// ─────────────────────────────────────────
// GET MEALS
// ─────────────────────────────────────────
router.get('/:homeId', auth, async (req, res) => {
  try {
    const meals = await Meal.find({ homeId: req.params.homeId })
      .populate('userId', 'firstName email')
      .sort({ date: -1 });

    res.json(meals);

  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch meals',
      error: err.message
    });
  }
});

// ─────────────────────────────────────────
// UPDATE (ADMIN ONLY)
// ─────────────────────────────────────────
router.put('/:homeId/:mealId', auth, async (req, res) => {
  try {
    const home = await Home.findById(req.params.homeId);

    if (!home || !isAdmin(home, req.user.userId)) {
      return res.status(403).json({
        message: 'Only admin can edit meals'
      });
    }

    const parseNumber = (val) => {
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    // ✅ SAME FIX HERE ALSO
    let date = req.body.date ? new Date(req.body.date) : undefined;

    if (date && isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const meal = await Meal.findOneAndUpdate(
      {
        _id: req.params.mealId,
        homeId: req.params.homeId
      },
      {
        date,
        mealCount: parseNumber(req.body.mealCount),
        eggsCount: parseNumber(req.body.eggsCount),
      },
      { new: true }
    );

    if (!meal) {
      return res.status(404).json({ message: 'Meal not found' });
    }

    res.json(meal);

  } catch (err) {
    console.error('UPDATE MEAL ERROR:', err);
    res.status(500).json({
      message: 'Failed to update meal',
      error: err.message
    });
  }
});

// ─────────────────────────────────────────
// DELETE (ADMIN ONLY)
// ─────────────────────────────────────────
router.delete('/:homeId/:mealId', auth, async (req, res) => {
  try {
    const home = await Home.findById(req.params.homeId);

    if (!home || !isAdmin(home, req.user.userId)) {
      return res.status(403).json({
        message: 'Only admin can delete meals'
      });
    }

    const meal = await Meal.findOneAndDelete({
      _id: req.params.mealId,
      homeId: req.params.homeId
    });

    if (!meal) {
      return res.status(404).json({ message: 'Meal not found' });
    }

    res.json({ message: 'Deleted' });

  } catch (err) {
    console.error('DELETE MEAL ERROR:', err);
    res.status(500).json({
      message: 'Failed to delete meal',
      error: err.message
    });
  }
});

module.exports = router;