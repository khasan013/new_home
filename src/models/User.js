const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email:      { type: String, unique: true, required: true },
  password:   { type: String, required: true },
  firstName:  String,
  lastName:   String,
  isVerified: { type: Boolean, default: false },

  // 🔐 OTP fields
  otp:        String,          // 6-digit code (plain; short-lived so no need to hash)
  otpExpiry:  Date             // 10 minutes from generation
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);