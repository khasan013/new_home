// routes/admin.routes.js
const express = require('express');
const Home = require('../models/Home');
const User = require('../models/User');
const Meal = require('../models/Meal');
const Expense = require('../models/Expense');
const Penalty = require('../models/Penalty');
const Bill = require('../models/Bill');
const auth = require('../middleware/auth');
const { requireHomeMember } = require('../utils/homeAccess');
const { deliverBillEmails } = require('../services/billDelivery');


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
    await home.populate('members.user', 'firstName lastName email');
    res.json(home.members);
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
    await requireAdmin(req.params.homeId, req.user.userId);
    const { userId, meals, reason, injectMeal } = req.body;

    if (!userId || meals === undefined || meals === null || meals === '') {
      return res.status(400).json({ message: 'User and meals are required' });
    }

    const penaltyMeals = Number(meals);
    if (!Number.isFinite(penaltyMeals) || penaltyMeals <= 0) {
      return res.status(400).json({ message: 'Penalty meals must be a valid number greater than 0' });
    }

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
    const fullHome = await requireAdmin(req.params.homeId, req.user.userId);
    await fullHome.populate('members.user', 'firstName lastName email isVerified');

    const month = req.body.month || new Date().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const now = new Date();
    const periodStart = req.body.periodStart
      ? new Date(req.body.periodStart)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = req.body.periodEnd
      ? new Date(req.body.periodEnd)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const eggPrice = Number(req.body.totalEggPrice) || 0;
    const eggCount = Number(req.body.totalEggCount) || 0;
    const consumed = Number(req.body.consumedEgg) || 0;
    const other = Number(req.body.otherCost) || 0;
    const perEgg = Number(req.body.perEgg) || (eggCount > 0 ? eggPrice / eggCount : 0);
    const consumedCost = consumed * perEgg;
    const remainingEggCost = eggPrice - consumedCost;

    const meals = await Meal.find({
      homeId: req.params.homeId,
      isPenalty: false,
    })
      .select('userId mealCount eggsCount')
      .populate('userId', 'firstName lastName email')
      .lean();

    const calculatedMeals = meals.reduce((sum, meal) => sum + (Number(meal.mealCount) || 0), 0);
    const totalMeals = Number(req.body.totalMeals) || calculatedMeals;
    const totalBill = Number(req.body.totalBill) || (remainingEggCost + other);

    if (totalMeals <= 0) {
      return res.status(400).json({ message: 'No meals found for this bill' });
    }

    if ([eggPrice, eggCount, consumed, other, perEgg, totalMeals, totalBill].some(value => Number.isNaN(value) || value < 0)) {
      return res.status(400).json({ message: 'Bill values must be valid positive numbers' });
    }

    if (Math.abs(calculatedMeals - totalMeals) > 0.001) {
      console.warn('Meal mismatch:', calculatedMeals, totalMeals);
    }

    const perMeal = totalBill / totalMeals;
    const memberMap = {};

    for (const meal of meals) {
      if (!meal.userId) continue;
      const uid = meal.userId._id.toString();
      const name = `${meal.userId.firstName || ''} ${meal.userId.lastName || ''}`.trim()
        || meal.userId.email;

      if (!memberMap[uid]) {
        memberMap[uid] = {
          userId: uid,
          name,
          email: meal.userId.email,
          meals: 0,
          eggs: 0,
          share: 0,
        };
      }

      memberMap[uid].meals += Number(meal.mealCount) || 0;
      memberMap[uid].eggs += Number(meal.eggsCount) || 0;
    }

    Object.values(memberMap).forEach(member => {
      const mealCost = perMeal * member.meals;
      const eggCost = member.eggs * perEgg;
      member.share = mealCost + eggCost;
    });

    const breakdown = Object.values(memberMap);
    const costSummary = { eggPrice, perEgg, consumedCost, remainingEggCost, other };

    const recipients = fullHome.members
      .filter(({ user }) => user?.email)
      .map(({ user }) => {
        const entry = memberMap[user._id.toString()];
        const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
        return {
          email: user.email,
          firstName: user.firstName,
          name,
          meals: entry?.meals || 0,
          eggs: entry?.eggs || 0,
          share: entry?.share || 0,
        };
      });

    const bill = await Bill.create({
      homeId: req.params.homeId,
      month,
      periodStart,
      periodEnd,
      totalEggPrice: eggPrice,
      totalEggCount: eggCount,
      consumedEgg: consumed,
      otherCost: other,
      totalMeals,
      totalBill,
      perEgg,
      perMeal,
      sentCount: 0,
      failedCount: 0,
      deliveryStatus: 'queued',
      sentBy: req.user.userId,
      breakdown,
      costSummary,
    });

    await Bill.findByIdAndUpdate(bill._id, { deliveryStatus: 'sending' });

    try {
      const { sent, failed } = await deliverBillEmails({
        recipients,
        homeName: fullHome.name,
        month,
        totalBill,
        totalMeals,
        perMeal,
        breakdown,
        costSummary,
      });

      const deliveryStatus = failed === 0
        ? 'sent'
        : sent === 0
          ? 'failed'
          : 'partial';

      await Bill.findByIdAndUpdate(bill._id, {
        sentCount: sent,
        failedCount: failed,
        deliveryStatus,
        deliveryCompletedAt: new Date(),
      });
    } catch (deliveryError) {
      console.error('BILL DELIVERY ERROR:', deliveryError);
      await Bill.findByIdAndUpdate(bill._id, {
        deliveryStatus: 'failed',
        deliveryCompletedAt: new Date(),
      });
    }

    res.status(202).json({
      message: `Bill queued for ${recipients.length} member(s). You can send another bill anytime.`,
      bill,
      totalBill,
      perMeal,
      breakdown,
      queued: recipients.length,
    });
  } catch (err) {
    console.error('BILL SEND ERROR:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /admin/:homeId/bills
router.get('/:homeId/bills', auth, async (req, res) => {
  try {
    await requireHomeMember(req.params.homeId, req.user.userId);
    const limit = Math.min(Number(req.query.limit) || 3, 12);
    const bills = await Bill.find({ homeId: req.params.homeId })
      .sort({ periodStart: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(bills);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /admin/:homeId/bills/:billId
router.get('/:homeId/bills/:billId', auth, async (req, res) => {
  try {
    await requireHomeMember(req.params.homeId, req.user.userId);
    const bill = await Bill.findOne({
      _id: req.params.billId,
      homeId: req.params.homeId,
    }).lean();
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    res.json(bill);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
