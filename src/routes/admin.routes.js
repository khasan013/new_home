// routes/admin.routes.js
const express = require('express');
const Home    = require('../models/Home');
const User    = require('../models/User');
const Meal    = require('../models/Meal');
const Expense = require('../models/Expense');
const Penalty = require('../models/Penalty');
const auth    = require('../middleware/auth');
const { sendBillEmail } = require('../utils/sendEmail');

const router = express.Router();

// ── Helper: verify caller is admin ───────────────────────
const requireAdmin = async (homeId, userId) => {
  const home = await Home.findById(homeId);
  if (!home) throw Object.assign(new Error('Home not found'), { status: 404 });
  const member = home.members.find(m => m.user.toString() === userId);
  if (!member || member.role !== 'admin')
    throw Object.assign(new Error('Admin access required'), { status: 403 });
  return home;
};

// ─────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────

// GET /admin/:homeId/members
router.get('/:homeId/members', auth, async (req, res) => {
  try {
    const home = await requireAdmin(req.params.homeId, req.user.userId);
    const populated = await Home.findById(req.params.homeId)
      .populate('members.user', 'firstName lastName email');
    res.json(populated.members);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PUT /admin/:homeId/members/:userId/promote
router.put('/:homeId/members/:userId/promote', auth, async (req, res) => {
  try {
    const home = await requireAdmin(req.params.homeId, req.user.userId);
    const member = home.members.find(m => m.user.toString() === req.params.userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });

    member.role = member.role === 'admin' ? 'member' : 'admin';
    await home.save();
    res.json({ role: member.role });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// DELETE /admin/:homeId/members/:userId
router.delete('/:homeId/members/:userId', auth, async (req, res) => {
  try {
    const home = await requireAdmin(req.params.homeId, req.user.userId);
    home.members = home.members.filter(m => m.user.toString() !== req.params.userId);
    await home.save();
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PENALTIES  (penalty = extra meals deducted from user balance)
// ─────────────────────────────────────────────────────────

// GET /admin/:homeId/penalties
router.get('/:homeId/penalties', auth, async (req, res) => {
  try {
    await requireAdmin(req.params.homeId, req.user.userId);
    const penalties = await Penalty.find({ homeId: req.params.homeId })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json(penalties);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// POST /admin/:homeId/penalties
// Body: { userId, meals, reason }
// Effect: creates a Penalty record AND injects a negative meal entry so the
//         user's effective meal count goes up (they owe more).
router.post('/:homeId/penalties', auth, async (req, res) => {
  try {
    const { userId, meals, reason, injectMeal } = req.body;

    if (!userId || !meals) {
      return res.status(400).json({ message: 'User and meals are required' });
    }

    const penaltyMeals = Number(meals);

    // ✅ 1. Save penalty (MAIN RECORD)
    const penalty = await Penalty.create({
      homeId: req.params.homeId,
      userId,
      amount: penaltyMeals,
      reason: reason || '',
    });

    // ✅ 2. OPTIONAL meal injection (FIXED)
    if (injectMeal !== false) {
      await Meal.create({
        homeId: req.params.homeId,
        userId,
        date: new Date(),
        mealCount: penaltyMeals,
        eggsCount: 0,
        isPenalty: true,
        penaltyReason: reason || 'Penalty',
      });
    }

    // ✅ 3. populate user for frontend
    const populated = await penalty.populate('userId', 'firstName lastName email');

    res.json(populated);

  } catch (err) {
    console.error('❌ Penalty error:', err); // 🔥 VERY IMPORTANT for debugging
    res.status(500).json({
      message: 'Failed to add penalty',
      error: err.message
    });
  }
});

// DELETE /admin/:homeId/penalties/:penId
router.delete('/:homeId/penalties/:penId', auth, async (req, res) => {
  try {
    await requireAdmin(req.params.homeId, req.user.userId);
    await Penalty.findOneAndDelete({ _id: req.params.penId, homeId: req.params.homeId });
    res.json({ message: 'Penalty removed' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// BILL  – admin enters total costs, system calculates each
//         member's share and emails everyone automatically
// ─────────────────────────────────────────────────────────

// POST /admin/:homeId/bill/send
// Body: { totalEggPrice, totalEggCount, consumedEgg, otherCost, month }
router.post('/:homeId/bill/send', auth, async (req, res) => {
  try {
    const home = await requireAdmin(req.params.homeId, req.user.userId);
    const fullHome = await Home.findById(req.params.homeId)
      .populate('members.user', 'firstName lastName email isVerified');

    const { totalEggPrice, totalEggCount, consumedEgg, otherCost, month } = req.body;

    // ── Egg cost math ──────────────────────────────────
    const eggPrice   = Number(totalEggPrice) || 0;
    const eggCount   = Number(totalEggCount) || 1;  // avoid div/0
    const consumed   = Number(consumedEgg)   || 0;
    const other      = Number(otherCost)     || 0;

    const perEgg          = eggPrice / eggCount;
    const consumedCost    = consumed * perEgg;
    const remainingEggCost = eggPrice - consumedCost;
    const totalBill       = other + remainingEggCost;

    // ── Meal-based fair share ──────────────────────────
    const meals = await Meal.find({ homeId: req.params.homeId })
      .populate('userId', 'firstName lastName email');

    const totalMeals = meals.reduce((s, m) => s + m.mealCount, 0);
    const perMeal    = totalMeals ? totalBill / totalMeals : 0;

    // Build member breakdown
    const memberMap = {};
    for (const meal of meals) {
      if (!meal.userId) continue;
      const uid  = meal.userId._id.toString();
      const name = `${meal.userId.firstName || ''} ${meal.userId.lastName || ''}`.trim()
                   || meal.userId.email;
      if (!memberMap[uid]) memberMap[uid] = { name, email: meal.userId.email, meals: 0, share: 0 };
      memberMap[uid].meals += meal.mealCount;
    }
    Object.values(memberMap).forEach(m => {
      m.share = totalMeals ? (m.meals / totalMeals) * totalBill : 0;
    });

    const breakdown = Object.values(memberMap);

    // ── Email every verified member ────────────────────
    let sent = 0;
    for (const { user } of fullHome.members) {
      if (!user || !user.isVerified) continue;
      const uid   = user._id.toString();
      const entry = memberMap[uid];
      const share = entry ? entry.share : 0;
      const userMeals = entry ? entry.meals : 0;

      await sendBillEmail({
        to:        user.email,
        firstName: user.firstName || 'there',
        month:     month || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        totalBill,
        perMeal,
        userMeals,
        share,
        breakdown,
        costSummary: { eggPrice, perEgg, consumedCost, remainingEggCost, other },
      });
      sent++;
    }

    res.json({
      message: `✅ Bills sent to ${sent} member(s)`,
      totalBill,
      perMeal,
      breakdown,
    });
  } catch (err) {
    console.error('BILL SEND ERROR:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;