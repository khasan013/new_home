const express = require('express');
const Meal = require('../models/Meal');
const Home = require('../models/Home');
const auth = require('../middleware/auth');
const { requireHomeMember } = require('../utils/homeAccess');

const router = express.Router();

// ✅ Helper: check admin
const isAdmin = (home, userId) => {
  return home.members.some(
    (m) => m.user.toString() === userId && m.role === 'admin'
  );
};

// ─────────────────────────────────────────
// CREATE MEAL (FIXED)
// ─────────────────────────────────────────
router.post('/:homeId', auth, async (req, res) => {
  try {
    const { homeId } = req.params;

    console.log('REQ BODY:', req.body);

    const home = await Home.findById(homeId);
    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    const isMember = home.members.some(
      (m) => m.user.toString() === req.user.userId
    );

    if (!isMember) {
      return res.status(403).json({
        message: 'You are not a member of this home'
      });
    }

    const parseNonNegativeNumber = (val, fieldName) => {
      if (val === undefined || val === null) return 0;
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0) {
        throw Object.assign(new Error(`${fieldName} must be a valid non-negative number`), { status: 400 });
      }
      return num;
    };

    let date = req.body.date ? new Date(req.body.date) : new Date();

    if (isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // 🔥 IMPORTANT FIX (normalize date to match unique index)
    date.setHours(0, 0, 0, 0);

    const roundMealCount = value => Math.round((value + Number.EPSILON) * 100) / 100;
    let mealCount = parseNonNegativeNumber(req.body.mealCount, 'Meal count');
    let eggsCount = parseNonNegativeNumber(req.body.eggsCount, 'Egg count');
    let mealSections = null;

    // Recalculate weighted meals on the server so dashboard, bill, and reports
    // all receive the same two-decimal total. Extra eggs remain an egg count.
    if (req.body.mealSections && typeof req.body.mealSections === 'object') {
      const { quantities = {}, percentages = {} } = req.body.mealSections;
      const sectionNames = ['meat', 'vegetables', 'egg', 'rice', 'vat'];
      const sections = {};
      let computedMealCount = 0;

      for (const name of sectionNames) {
        const quantity = parseNonNegativeNumber(quantities[name], `${name} quantity`);
        const percent = parseNonNegativeNumber(percentages[name], `${name} percentage`);
        if (percent > 100) {
          return res.status(400).json({ message: `${name} percentage cannot exceed 100` });
        }
        // Rice is selected as a meal fraction directly (e.g. 0.15 = 0.15 meal).
        // Other sections convert their selected item count by their meal share.
        const rawContribution = name === 'rice' ? quantity : quantity * percent / 100;
        const contribution = Math.round((rawContribution + Number.EPSILON) * 100) / 100;
        sections[name] = { quantity, percent, contribution };
        computedMealCount += contribution;
      }

      mealCount = roundMealCount(computedMealCount);
      eggsCount += sections.egg.quantity;
      mealSections = sections;
    }

    // UPSERT so multiple additions on the same day keep the existing daily record.
    const meal = await Meal.findOneAndUpdate(
      {
        homeId,
        userId: req.user.userId,
        date
      },
      {
        $inc: {
          mealCount,
          eggsCount,
        },
        ...(mealSections ? { $set: { mealSections } } : {}),
      },
      {
        new: true,
        upsert: true
      }
    );

    // ✅ populate (same as your code)
    await meal.populate('userId', 'firstName email');

    res.json(meal);

  } catch (err) {
    console.error('CREATE MEAL ERROR FULL:', err);
    res.status(err.status || 500).json({
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
    await requireHomeMember(req.params.homeId, req.user.userId);

    const limit = Math.min(Number(req.query.limit) || 0, 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const query = Meal.find({ homeId: req.params.homeId })
      .populate('userId', 'firstName email')
      .sort({ date: -1, _id: -1 })
      .lean();

    if (limit) query.limit(limit).skip(skip);

    const meals = await query;

    if (limit) {
      return res.json({
        data: meals,
        pagination: {
          limit,
          skip,
          nextSkip: meals.length === limit ? skip + limit : null
        }
      });
    }

    res.json(meals);

  } catch (err) {
    res.status(err.status || 500).json({
      message: err.message || 'Failed to fetch meals'
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

    const parseNonNegativeNumber = (val, fieldName) => {
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0) {
        throw Object.assign(new Error(`${fieldName} must be a valid non-negative number`), { status: 400 });
      }
      return num;
    };

    let date = req.body.date ? new Date(req.body.date) : undefined;

    if (date && isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    if (date) {
      date.setHours(0, 0, 0, 0); // 🔥 keep consistency
    }

    const updateData = {};

    if (date) updateData.date = date;
    if (req.body.mealCount !== undefined) {
      updateData.mealCount = parseNonNegativeNumber(req.body.mealCount, 'Meal count');
    }
    if (req.body.eggsCount !== undefined) {
      updateData.eggsCount = parseNonNegativeNumber(req.body.eggsCount, 'Egg count');
    }

    const meal = await Meal.findOneAndUpdate(
      {
        _id: req.params.mealId,
        homeId: req.params.homeId
      },
      updateData,
      { new: true }
    ).populate('userId', 'firstName email');

    if (!meal) {
      return res.status(404).json({ message: 'Meal not found' });
    }

    res.json(meal);

  } catch (err) {
    console.error('UPDATE MEAL ERROR:', err);
    res.status(err.status || 500).json({
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
