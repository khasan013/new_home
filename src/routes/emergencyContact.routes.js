const express = require('express');
const EmergencyContact = require('../models/EmergencyContact');
const auth = require('../middleware/auth');
const { requireHomeMember, requireHomeAdmin } = require('../utils/homeAccess');

const router = express.Router();

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanPhone(value) {
  return cleanText(value).replace(/[^\d+()\-\s]/g, '');
}

function getHomeId(req) {
  return cleanText(req.query.homeId || req.body.homeId);
}

// GET /api/emergency-contacts?homeId=:homeId
router.get('/', auth, async (req, res) => {
  try {
    const homeId = getHomeId(req);
    if (!homeId) return res.status(400).json({ message: 'Home is required' });

    await requireHomeMember(homeId, req.user.userId);
    const contacts = await EmergencyContact.findOne({ homeId }).lean();

    res.json(contacts || {
      homeId,
      caretakerName: '',
      caretakerPhone: '',
      gasProviderName: '',
      gasProviderPhone: '',
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PUT /api/emergency-contacts
router.put('/', auth, async (req, res) => {
  try {
    const homeId = getHomeId(req);
    if (!homeId) return res.status(400).json({ message: 'Home is required' });

    await requireHomeAdmin(homeId, req.user.userId);

    const body = {
      homeId,
      caretakerName: cleanText(req.body.caretakerName),
      caretakerPhone: cleanPhone(req.body.caretakerPhone),
      gasProviderName: cleanText(req.body.gasProviderName),
      gasProviderPhone: cleanPhone(req.body.gasProviderPhone),
      updatedBy: req.user.userId,
    };

    const contacts = await EmergencyContact.findOneAndUpdate(
      { homeId },
      body,
      { new: true, upsert: true, runValidators: true }
    );

    res.json(contacts);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
