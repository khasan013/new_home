const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const homeSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  members: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: { type: String, enum: ['admin', 'member'], default: 'member' }
    }
  ],

  // 👥 Invite code — auto-generated on creation
  inviteCode: {
    type:    String,
    unique:  true,
    default: () => uuidv4().split('-')[0].toUpperCase() // e.g. "A3F9B2C1" — short & readable
  }
}, { timestamps: true });

module.exports = mongoose.model('Home', homeSchema);