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

  // 👥 Members array with role-based structure
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

  // 🔑 Invite code — auto-generated on creation
  // Format: "ABC1234D" (8 characters from UUID)
  inviteCode: {
    type: String,
    unique: true,
    required: true,
    default: () => {
      // Generate 8-character code from UUID (uppercase)
      const uuid = uuidv4().split('-')[0].toUpperCase();
      return uuid;
    },
    uppercase: true,
    trim: true,
  },

  // 📅 Timestamps
}, { 
  timestamps: true 
});

// Index for faster invite code lookups
homeSchema.index({ inviteCode: 1 });
homeSchema.index({ 'members.user': 1 });

module.exports = mongoose.model('Home', homeSchema);