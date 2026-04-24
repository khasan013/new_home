const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    unique: true, 
    required: true,
    lowercase: true,        // ✅ ensure consistency
    trim: true              // ✅ remove extra spaces
  },

  password: { 
    type: String, 
    required: true 
  },

  firstName: { 
    type: String,
    trim: true              // ✅ clean input
  },

  lastName: { 
    type: String,
    trim: true              // ✅ clean input
  },

  isVerified: { 
    type: Boolean, 
    default: false 
  },

  // 🔐 OTP fields
  otp: { 
    type: String 
  },

  otpExpiry: { 
    type: Date 
  }

}, { timestamps: true });

// ✅ Prevent duplicate email errors crash
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);