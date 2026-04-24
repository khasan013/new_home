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

  // 🔥 ADD THIS (FOR RESET PASSWORD)
  resetOtp: {
    type: String
  },

  resetOtpExpiry: {
    type: Date
  }

}, { timestamps: true });

// index
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);