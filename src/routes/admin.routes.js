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

// GET /admin/:homeId/water-bottle-price
router.get('/:homeId/water-bottle-price', auth, async (req, res) => {
  try {
    const home = await requireAdmin(req.params.homeId, req.user.userId);
    res.json({ waterBottlePrice: home.waterBottlePrice || 0 });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PUT /admin/:homeId/water-bottle-price
router.put('/:homeId/water-bottle-price', auth, async (req, res) => {
  try {
    const home = await requireAdmin(req.params.homeId, req.user.userId);
    const price = Number(req.body.waterBottlePrice);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: 'Water bottle price must be a valid non-negative number' });
    }

    home.waterBottlePrice = price;
    await home.save();
    res.json({ waterBottlePrice: home.waterBottlePrice });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PUT /admin/:homeId/water-bill-exclusions
router.put('/:homeId/water-bill-exclusions', auth, async (req, res) => {
  try {
    const home = await requireAdmin(req.params.homeId, req.user.userId);
    const requestedIds = req.body.excludedUserIds;
    if (!Array.isArray(requestedIds)) {
      return res.status(400).json({ message: 'excludedUserIds must be an array' });
    }

    const memberIds = new Set(home.members.map(member => member.user.toString()));
    const normalizedIds = [...new Set(requestedIds.map(id => String(id)))];
    if (normalizedIds.some(id => !memberIds.has(id))) {
      return res.status(400).json({ message: 'Water bill exclusions must only include current home members' });
    }

    home.waterBillExcludedUsers = normalizedIds;
    await home.save();
    res.json({ excludedUserIds: normalizedIds });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

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
    console.log('BILL SEND FLOW: request received', {
      homeId: req.params.homeId,
      userId: req.user.userId,
      requestedMonth: req.body.month,
    });

    const fullHome = await requireAdmin(req.params.homeId, req.user.userId);
    await fullHome.populate('members.user', 'firstName lastName email isVerified');

    console.log('BILL SEND FLOW: home loaded', {
      homeId: fullHome._id,
      homeName: fullHome.name,
      memberCount: fullHome.members?.length || 0,
      memberEmails: (fullHome.members || []).map(member => member.user?.email || null),
    });

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
    const shared = Number(req.body.sharedCost) || 0;
    const water = Number(req.body.waterCost) || 0;
    const perEgg = Number(req.body.perEgg) || (eggCount > 0 ? eggPrice / eggCount : 0);
    const consumedCost = consumed * perEgg;
    const remainingEggCost = eggPrice - consumedCost;

    const meals = await Meal.find({
      homeId: req.params.homeId,
      isPenalty: false,
      // A bill must only use meals in its own billing period. Without this
      // filter, a later bill accidentally includes meals from other months.
      date: { $gte: periodStart, $lt: periodEnd },
    })
      .select('userId mealCount eggsCount')
      .populate('userId', 'firstName lastName email')
      .lean();

    console.log('BILL SEND FLOW: meals loaded', {
      homeId: req.params.homeId,
      mealCount: meals.length,
      populatedMealEmails: meals.map(meal => meal.userId?.email || null),
    });

    const calculatedMeals = meals.reduce((sum, meal) => sum + (Number(meal.mealCount) || 0), 0);
    const requestedTotalMeals = req.body.totalMeals === undefined || req.body.totalMeals === null || req.body.totalMeals === ''
      ? null
      : Number(req.body.totalMeals);
    const totalMeals = calculatedMeals;
    const mealBasedBill = remainingEggCost + other;
    const totalBill = mealBasedBill + consumedCost + shared;

    if (totalMeals <= 0) {
      return res.status(400).json({ message: 'No meals found for this bill' });
    }

    if ([eggPrice, eggCount, consumed, other, shared, water, perEgg, totalMeals, totalBill].some(value => Number.isNaN(value) || value < 0)) {
      return res.status(400).json({ message: 'Bill values must be valid positive numbers' });
    }

    if (requestedTotalMeals !== null && (!Number.isFinite(requestedTotalMeals) || Math.abs(requestedTotalMeals - calculatedMeals) > 0.001)) {
      return res.status(400).json({
        message: `Meal total changed. Expected ${calculatedMeals}, received ${req.body.totalMeals}. Refresh the bill and send again.`,
      });
    }

    const perMeal = mealBasedBill / totalMeals;
    const memberMap = {};

    fullHome.members.forEach(({ user }) => {
      if (!user) return;
      const uid = user._id.toString();
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      memberMap[uid] = {
        userId: uid,
        name,
        email: user.email,
        meals: 0,
        eggs: 0,
        share: 0,
        equalShare: 0,
        waterShare: 0,
      };
    });

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
          equalShare: 0,
          waterShare: 0,
        };
      }

      memberMap[uid].meals += Number(meal.mealCount) || 0;
      memberMap[uid].eggs += Number(meal.eggsCount) || 0;
    }

    const memberCount = Object.keys(memberMap).length;
    const excludedWaterUsers = new Set((fullHome.waterBillExcludedUsers || []).map(id => id.toString()));
    const waterEligibleCount = Object.keys(memberMap).filter(uid => !excludedWaterUsers.has(uid)).length;
    const sharedPerMember = memberCount > 0 ? shared / memberCount : 0;
    const waterPerMember = waterEligibleCount > 0 ? water / waterEligibleCount : 0;
    const perMemberShare = sharedPerMember;

    Object.values(memberMap).forEach(member => {
      const mealCost = perMeal * member.meals;
      const eggCost = member.eggs * perEgg;
      member.waterShare = excludedWaterUsers.has(member.userId) ? 0 : waterPerMember;
      member.equalShare = sharedPerMember;
      member.share = mealCost + eggCost + member.equalShare;
    });

    const breakdown = Object.values(memberMap);
    const costSummary = { eggPrice, perEgg, consumedCost, remainingEggCost, other, shared, water, perMemberShare };

    const recipients = fullHome.members
      .filter(({ user }) => user)
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
          equalShare: entry?.equalShare || 0,
          waterShare: entry?.waterShare || 0,
        };
      });

    console.log('BILL SEND FLOW: recipients prepared', {
      recipientCount: recipients.length,
      recipients: recipients.map(recipient => ({
        email: recipient.email,
        name: recipient.name,
        meals: recipient.meals,
        eggs: recipient.eggs,
        waterShare: recipient.waterShare,
        share: recipient.share,
      })),
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
      sharedCost: shared,
      waterCost: water,
      totalMeals,
      totalBill,
      perEgg,
      perMeal,
      perMemberShare,
      sentCount: 0,
      failedCount: 0,
      deliveryStatus: 'queued',
      sentBy: req.user.userId,
      breakdown,
      costSummary,
    });

    const billForResponse = await Bill.findByIdAndUpdate(
      bill._id,
      { deliveryStatus: 'sending' },
      { new: true }
    ).lean() || bill;

    const processBillDelivery = async () => {
      console.log('BILL SEND FLOW: invoking deliverBillEmails', {
        billId: bill._id,
        recipientCount: recipients.length,
        month,
      });

      const { sent, failed, failures } = await deliverBillEmails({
        recipients,
        homeName: fullHome.name,
        month,
        totalBill,
        totalMeals,
        perMeal,
        breakdown,
        costSummary,
      });

      console.log('BILL SEND FLOW: deliverBillEmails resolved', {
        billId: bill._id,
        sent,
        failed,
      });

      const deliveryStatus = failed === 0
        ? 'sent'
        : sent === 0
          ? 'failed'
          : 'partial';

      await Bill.findByIdAndUpdate(bill._id, {
        sentCount: sent,
        failedCount: failed,
        deliveryErrors: failures,
        deliveryStatus,
        deliveryCompletedAt: new Date(),
      });
    };

    // Do not detach this work from the request. Serverless runtimes can terminate
    // immediately after a response is sent, which silently drops queued emails.
    try {
      await processBillDelivery();
    } catch (deliveryError) {
      console.error('BILL DELIVERY ERROR:', {
        billId: bill._id,
        message: deliveryError?.message || deliveryError,
        stack: deliveryError?.stack || deliveryError,
      });

      await Bill.findByIdAndUpdate(bill._id, {
        failedCount: recipients.length,
        deliveryErrors: [{ email: null, reason: deliveryError?.message || 'Bill delivery failed' }],
        deliveryStatus: 'failed',
        deliveryCompletedAt: new Date(),
      });
      throw deliveryError;
    }

    const completedBill = await Bill.findById(bill._id).lean() || billForResponse;
    const responseMessage = completedBill.failedCount > 0
      ? `Bill generated: ${completedBill.sentCount} sent, ${completedBill.failedCount} failed. Check delivery errors and email configuration.`
      : `Bill generated and delivered to ${completedBill.sentCount} member(s).`;

    const responseBody = {
      message: responseMessage,
      bill: completedBill,
      totalBill,
      perMeal,
      breakdown,
      sent: completedBill.sentCount,
      failed: completedBill.failedCount,
      deliveryErrors: completedBill.deliveryErrors || [],
      deliveryStatus: completedBill.deliveryStatus,
    };

    return res.status(201).json(responseBody);
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
