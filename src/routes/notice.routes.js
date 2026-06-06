const express = require('express');
const Notice = require('../models/Notice');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireHomeMember, requireHomeAdmin } = require('../utils/homeAccess');

const router = express.Router();
const VALID_CATEGORIES = ['general', 'emergency'];

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// POST /api/notices
router.post('/', auth, async (req, res) => {
  try {
    const title = cleanText(req.body.title);
    const message = cleanText(req.body.message);
    const category = cleanText(req.body.category).toLowerCase();
    const homeId = cleanText(req.body.homeId);

    if (!homeId) return res.status(400).json({ message: 'Home is required' });
    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (!message) return res.status(400).json({ message: 'Message is required' });
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid notice category' });
    }

    await requireHomeMember(homeId, req.user.userId);

    const user = await User.findById(req.user.userId).select('firstName lastName email').lean();
    const postedByName = user
      ? (`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email)
      : 'Unknown';

    const notice = await Notice.create({
      title,
      message,
      category,
      homeId,
      postedBy: req.user.userId,
      postedByName,
    });

    res.status(201).json(notice);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /api/notices/:homeId
router.get('/:homeId', auth, async (req, res) => {
  try {
    await requireHomeMember(req.params.homeId, req.user.userId);
    const notices = await Notice.find({ homeId: req.params.homeId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(notices);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// DELETE /api/notices/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ message: 'Notice not found' });

    await requireHomeAdmin(notice.homeId, req.user.userId);
    await notice.deleteOne();

    res.json({ message: 'Notice deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
