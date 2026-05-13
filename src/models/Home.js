const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const homeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  description: {
    type: String,
    default: '',
  },

  members: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member',
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
    }
  ],

  inviteCode: {
    type: String,
    unique: true,
    required: true,
    default: () => {
      const uuid = uuidv4().split('-')[0].toUpperCase();
      return uuid;
    },
    uppercase: true,
    trim: true,
  },

}, { 
  timestamps: true 
});

// ❌ removed duplicate index
// homeSchema.index({ inviteCode: 1 });

// ✅ keep this
homeSchema.index({ 'members.user': 1 });

module.exports = mongoose.model('Home', homeSchema);