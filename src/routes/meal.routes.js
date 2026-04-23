const express = require('express'); // ✅ FIX: was missing
const Meal = require('../models/Meal');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/:homeId', auth, async (req, res) => {
  try { // ✅ FIX: added try/catch
    const meal = await Meal.create({
      homeId: req.params.homeId,
      userId: req.user.userId,
      date: req.body.date,
      mealCount: req.body.mealCount,
      eggsCount: req.body.eggsCount
    });

    res.json(meal);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create meal', error: err.message });
  }
});

router.get('/:homeId', auth, async (req, res) => {
  try { // ✅ FIX: added try/catch
    const meals = await Meal.find({ homeId: req.params.homeId });
    res.json(meals);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch meals', error: err.message });
  }
});

module.exports = router;
