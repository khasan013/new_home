const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    unique: true, 
    required: true,
    lowercase: true,
    trim: true
  },

  password: { 
    type: String, 
    required: true 
  },

  firstName: { 
    type: String,
    trim: true
  },

  lastName: { 
    type: String,
    trim: true
  },

  isVerified: { 
    type: Boolean, 
    default: false 
  },

  // 🔐 Email verification OTP
  otp: { 
    type: String 
  },

  otpExpiry: { 
    type: Date 
  },

  // 🔥 Reset password OTP
  resetOtp: {
    type: String
  },

  resetOtpExpiry: {
    type: Date
  }

}, { timestamps: true });

// ❌ removed duplicate index

module.exports = mongoose.model('User', userSchema);