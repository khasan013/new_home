// routes/home.routes.js
const express = require('express');
const Home    = require('../models/Home');
const auth    = require('../middleware/auth');

const router = express.Router();

// POST /api/home — create a new home
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Home name is required' });
    }

    const home = await Home.create({
      name: name.trim(),
      members: [{ user: req.user.userId, role: 'admin' }]
    });

    // Populate members before sending response
    const populatedHome = await Home.findById(home._id)
      .populate('members.user', 'firstName lastName email');

    res.status(201).json(populatedHome);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create home', error: err.message });
  }
});

// GET /api/home — all homes the user belongs to
router.get('/', auth, async (req, res) => {
  try {
    const homes = await Home.find({ 'members.user': req.user.userId })
                            .populate('members.user', 'firstName lastName email')
                            .sort({ createdAt: -1 });
    res.json(homes);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch homes', error: err.message });
  }
});

// GET /api/home/:homeId — get single home by ID
router.get('/:homeId', auth, async (req, res) => {
  try {
    const { homeId } = req.params;

    const home = await Home.findById(homeId)
                           .populate('members.user', 'firstName lastName email');

    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    // Check if user is a member
    const isMember = home.members.some(m => m.user._id.toString() === req.user.userId);
    if (!isMember) {
      return res.status(403).json({ message: 'You do not have access to this home' });
    }

    res.json(home);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch home', error: err.message });
  }
});

// ────────────────────────────────────────────────────────
// POST /api/home/join — join by invite code (FIXED)
// ────────────────────────────────────────────────────────
router.post('/join', auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!inviteCode || !inviteCode.trim()) {
      return res.status(400).json({ message: 'Please enter an invite code' });
    }

    // Find home by invite code (case-insensitive)
    const home = await Home.findOne({ 
      inviteCode: inviteCode.trim().toUpperCase() 
    }).populate('members.user', 'firstName lastName email');

    if (!home) {
      return res.status(404).json({ 
        message: 'Invite code not found. Please check and try again.' 
      });
    }

    // Check if user is already a member
    const isMember = home.members.some(m => m.user._id.toString() === userId);
    
    if (isMember) {
      return res.status(409).json({ 
        message: 'You are already a member of this home' 
      });
    }

    // Add user to home members
    home.members.push({ user: userId, role: 'member' });
    await home.save();

    // Populate and return updated home
    const updatedHome = await Home.findById(home._id)
      .populate('members.user', 'firstName lastName email');

    res.json(updatedHome);
  } catch (err) {
    console.error('Error joining home:', err);
    res.status(500).json({ message: 'Failed to join home', error: err.message });
  }
});

// GET /api/home/:homeId/invite — get invite code (admin only)
router.get('/:homeId/invite', auth, async (req, res) => {
  try {
    const { homeId } = req.params;
    const userId = req.user.userId;

    const home = await Home.findById(homeId);
    
    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    // Check if user is admin
    const member = home.members.find(m => m.user.toString() === userId);
    
    if (!member) {
      return res.status(403).json({ message: 'You are not a member of this home' });
    }

    if (member.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can view the invite code' });
    }

    res.json({ inviteCode: home.inviteCode });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get invite code', error: err.message });
  }
});

// PUT /api/home/:homeId — update home (admin only)
router.put('/:homeId', auth, async (req, res) => {
  try {
    const { homeId } = req.params;
    const { name, description } = req.body;
    const userId = req.user.userId;

    const home = await Home.findById(homeId);

    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    // Check if user is admin
    const member = home.members.find(m => m.user.toString() === userId);
    
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can update home' });
    }

    if (name) home.name = name.trim();
    if (description) home.description = description.trim();

    await home.save();

    const updatedHome = await Home.findById(home._id)
      .populate('members.user', 'firstName lastName email');

    res.json(updatedHome);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update home', error: err.message });
  }
});

// DELETE /api/home/:homeId — delete home (admin only)
router.delete('/:homeId', auth, async (req, res) => {
  try {
    const { homeId } = req.params;
    const userId = req.user.userId;

    const home = await Home.findById(homeId);

    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    // Check if user is admin
    const member = home.members.find(m => m.user.toString() === userId);
    
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete home' });
    }

    await Home.findByIdAndDelete(homeId);

    res.json({ message: 'Home deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete home', error: err.message });
  }
});

// DELETE /api/home/:homeId/members/:memberId — remove member (admin only)
router.delete('/:homeId/members/:memberId', auth, async (req, res) => {
  try {
    const { homeId, memberId } = req.params;
    const userId = req.user.userId;

    const home = await Home.findById(homeId);

    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    // Check if requester is admin
    const requesterMember = home.members.find(m => m.user.toString() === userId);
    
    if (!requesterMember || requesterMember.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    // Remove member
    home.members = home.members.filter(m => m.user.toString() !== memberId);
    await home.save();

    const updatedHome = await Home.findById(home._id)
      .populate('members.user', 'firstName lastName email');

    res.json(updatedHome);
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove member', error: err.message });
  }
});

module.exports = router;