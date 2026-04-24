// routes/meal.routes.js
const express = require('express');
const Meal    = require('../models/Meal');
const Home    = require('../models/Home'); // ✅ ADD THIS
const auth    = require('../middleware/auth');

const router = express.Router();

// =====================================================
// HELPER: CHECK ADMIN
// =====================================================
const isAdmin = async (userId, homeId) => {
  const home = await Home.findById(homeId);
  if (!home) return false;

  const member = home.members.find(
    (m) => m.user.toString() === userId
  );

  return member?.role === 'admin';
};

// =====================================================
// CREATE (ANY USER)
// =====================================================
router.post('/:homeId', auth, async (req, res) => {
  try {
    const meal = await Meal.create({
      homeId:    req.params.homeId,
      userId:    req.user.userId,
      date:      req.body.date,
      mealCount: req.body.mealCount,
      eggsCount: req.body.eggsCount,
    });

    // ✅ populate user name for frontend
    const populated = await Meal.findById(meal._id)
      .populate('userId', 'firstName');

    res.json(populated);

  } catch (err) {
    res.status(500).json({ message: 'Failed to create meal', error: err.message });
  }
});

// =====================================================
// GET ALL
// =====================================================
router.get('/:homeId', auth, async (req, res) => {
  try {
    const meals = await Meal.find({ homeId: req.params.homeId })
      .populate('userId', 'firstName') // ✅ ADD THIS
      .sort({ date: -1 });

    res.json(meals);

  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch meals', error: err.message });
  }
});

// =====================================================
// UPDATE (ADMIN OR OWNER)
// =====================================================
router.put('/:homeId/:mealId', auth, async (req, res) => {
  try {
    const isUserAdmin = await isAdmin(req.user.userId, req.params.homeId);

    let meal;

    if (isUserAdmin) {
      // ✅ ADMIN can update any
      meal = await Meal.findOneAndUpdate(
        { _id: req.params.mealId, homeId: req.params.homeId },
        { date: req.body.date, mealCount: req.body.mealCount, eggsCount: req.body.eggsCount },
        { new: true }
      );
    } else {
      // ✅ USER can update only own
      meal = await Meal.findOneAndUpdate(
        { _id: req.params.mealId, homeId: req.params.homeId, userId: req.user.userId },
        { date: req.body.date, mealCount: req.body.mealCount, eggsCount: req.body.eggsCount },
        { new: true }
      );
    }

    if (!meal) return res.status(404).json({ message: 'Meal not found' });

    res.json(meal);

  } catch (err) {
    res.status(500).json({ message: 'Failed to update meal', error: err.message });
  }
});

// =====================================================
// DELETE (ADMIN OR OWNER)
// =====================================================
router.delete('/:homeId/:mealId', auth, async (req, res) => {
  try {
    const isUserAdmin = await isAdmin(req.user.userId, req.params.homeId);

    let meal;

    if (isUserAdmin) {
      // ✅ ADMIN can delete any
      meal = await Meal.findOneAndDelete({
        _id: req.params.mealId,
        homeId: req.params.homeId
      });
    } else {
      // ✅ USER can delete only own
      meal = await Meal.findOneAndDelete({
        _id: req.params.mealId,
        homeId: req.params.homeId,
        userId: req.user.userId
      });
    }

    if (!meal) return res.status(404).json({ message: 'Meal not found' });

    res.json({ message: 'Deleted' });

  } catch (err) {
    res.status(500).json({ message: 'Failed to delete meal', error: err.message });
  }
});

module.exports = router;