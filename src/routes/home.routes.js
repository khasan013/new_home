// routes/home.routes.js
const express = require('express');
const Home    = require('../models/Home');
const auth    = require('../middleware/auth');

const router = express.Router();

// POST /api/home — create a new home
router.post('/', auth, async (req, res) => {
  try {
    const home = await Home.create({
      name:    req.body.name,
      members: [{ user: req.user.userId, role: 'admin' }]
    });
    res.json(home);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create home', error: err.message });
  }
});

// GET /api/home — all homes the user belongs to
router.get('/', auth, async (req, res) => {
  try {
    const homes = await Home.find({ 'members.user': req.user.userId })
                            .populate('members.user', 'firstName lastName email');
    res.json(homes);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch homes', error: err.message });
  }
});

// POST /api/home/join — join by invite code
router.post('/join', auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ message: 'Invite code is required' });

    const home = await Home.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!home) return res.status(404).json({ message: 'Invalid invite code' });

    // Already a member?
    const already = home.members.some(m => m.user.toString() === req.user.userId);
    if (already) return res.status(400).json({ message: 'You are already a member of this home' });

    home.members.push({ user: req.user.userId, role: 'member' });
    await home.save();

    res.json(home);
  } catch (err) {
    res.status(500).json({ message: 'Failed to join home', error: err.message });
  }
});

// GET /api/home/:homeId/invite — get invite code (admin only)
router.get('/:homeId/invite', auth, async (req, res) => {
  try {
    const home = await Home.findById(req.params.homeId);
    if (!home) return res.status(404).json({ message: 'Home not found' });

    const member = home.members.find(m => m.user.toString() === req.user.userId);
    if (!member || member.role !== 'admin')
      return res.status(403).json({ message: 'Only admins can view the invite code' });

    res.json({ inviteCode: home.inviteCode });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get invite code', error: err.message });
  }
});

module.exports = router;
