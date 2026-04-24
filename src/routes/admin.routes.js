// routes/admin.routes.js
const express = require('express');
const mongoose = require('mongoose');
const Home    = require('../models/Home');
const User    = require('../models/User');
const auth    = require('../middleware/auth');

const router = express.Router();

// ── Admin guard middleware ────────────────────────────────
const adminOnly = async (req, res, next) => {
  try {
    const home = await Home.findById(req.params.homeId);
    if (!home) return res.status(404).json({ message: 'Home not found' });

    const member = home.members.find(m => m.user.toString() === req.user.userId);
    if (!member || member.role !== 'admin')
      return res.status(403).json({ message: 'Admin access required' });

    req.home = home;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── In-memory penalty store (replace with a Penalty model for production) ──
// Using a simple Map keyed by homeId for now
const penaltyStore = new Map(); // homeId → [{ _id, userId, amount, reason, month, year }]

const getPenalties = (homeId) => penaltyStore.get(homeId) || [];
const setPenalties = (homeId, list) => penaltyStore.set(homeId, list);

// GET /api/admin/:homeId/members
router.get('/:homeId/members', auth, adminOnly, async (req, res) => {
  try {
    const home = await Home.findById(req.params.homeId)
                           .populate('members.user', 'firstName lastName email isVerified');
    res.json(home.members);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/:homeId/members/:userId/promote  (toggle admin ↔ member)
router.put('/:homeId/members/:userId/promote', auth, adminOnly, async (req, res) => {
  try {
    const home   = req.home;
    const target = home.members.find(m => m.user.toString() === req.params.userId);
    if (!target) return res.status(404).json({ message: 'Member not found' });

    target.role = target.role === 'admin' ? 'member' : 'admin';
    await home.save();

    res.json({ role: target.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/:homeId/members/:userId
router.delete('/:homeId/members/:userId', auth, adminOnly, async (req, res) => {
  try {
    const home = req.home;
    home.members = home.members.filter(m => m.user.toString() !== req.params.userId);
    await home.save();
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/:homeId/penalties
router.get('/:homeId/penalties', auth, adminOnly, (req, res) => {
  res.json(getPenalties(req.params.homeId));
});

// POST /api/admin/:homeId/penalties
router.post('/:homeId/penalties', auth, adminOnly, (req, res) => {
  const { userId, amount, reason, month, year } = req.body;
  const list = getPenalties(req.params.homeId);
  const newPenalty = {
    _id: new mongoose.Types.ObjectId().toString(),
    userId, amount: parseFloat(amount), reason,
    month: month || new Date().getMonth() + 1,
    year:  year  || new Date().getFullYear(),
  };
  list.push(newPenalty);
  setPenalties(req.params.homeId, list);
  res.json(newPenalty);
});

// DELETE /api/admin/:homeId/penalties/:penId
router.delete('/:homeId/penalties/:penId', auth, adminOnly, (req, res) => {
  const list    = getPenalties(req.params.homeId);
  const updated = list.filter(p => p._id !== req.params.penId);
  setPenalties(req.params.homeId, updated);
  res.json({ message: 'Penalty removed' });
});

module.exports = router;
