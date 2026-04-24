// routes/meal.routes.js
const express = require('express');
const Meal    = require('../models/Meal');
const auth    = require('../middleware/auth');

const router = express.Router();

router.post('/:homeId', auth, async (req, res) => {
  try {
    const meal = await Meal.create({
      homeId:    req.params.homeId,
      userId:    req.user.userId,
      date:      req.body.date,
      mealCount: req.body.mealCount,
      eggsCount: req.body.eggsCount,
    });
    res.json(meal);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create meal', error: err.message });
  }
});

router.get('/:homeId', auth, async (req, res) => {
  try {
    const meals = await Meal.find({ homeId: req.params.homeId })
                            .sort({ date: -1 });
    res.json(meals);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch meals', error: err.message });
  }
});

router.put('/:homeId/:mealId', auth, async (req, res) => {
  try {
    const meal = await Meal.findOneAndUpdate(
      { _id: req.params.mealId, homeId: req.params.homeId, userId: req.user.userId },
      { date: req.body.date, mealCount: req.body.mealCount, eggsCount: req.body.eggsCount },
      { new: true }
    );
    if (!meal) return res.status(404).json({ message: 'Meal not found' });
    res.json(meal);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update meal', error: err.message });
  }
});

router.delete('/:homeId/:mealId', auth, async (req, res) => {
  try {
    const meal = await Meal.findOneAndDelete({
      _id: req.params.mealId, homeId: req.params.homeId, userId: req.user.userId
    });
    if (!meal) return res.status(404).json({ message: 'Meal not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete meal', error: err.message });
  }
});

module.exports = router;
