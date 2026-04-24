const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const { sendOTP } = require('../utils/sendEmail');

const router = express.Router();

// ── Helper: generate 6-digit OTP ──────────────────────────
const makeOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// =========================================================
// REGISTER
// =========================================================
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName) {
      return res.status(400).json({ message: 'Email, password and first name are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hash = await bcrypt.hash(password, 10);
    const otp  = makeOTP();

    await User.create({
      email,
      password: hash,
      firstName,
      lastName,
      otp,
      otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
    });

    await sendOTP(email, otp);

    res.json({ message: 'Registered. Check your email for verification code.' });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// =========================================================
// VERIFY EMAIL OTP
// =========================================================
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isVerified) {
      return res.status(400).json({ message: 'Already verified' });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: 'No OTP found. Please register again.' });
    }

    if (String(user.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Email verified',
      token,
      user: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Verification failed', error: err.message });
  }
});

// =========================================================
// RESEND OTP
// =========================================================
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isVerified) {
      return res.status(400).json({ message: 'Already verified' });
    }

    const otp = makeOTP();

    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();

    await sendOTP(email, otp);

    res.json({ message: 'New OTP sent' });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Resend failed', error: err.message });
  }
});

// =========================================================
// LOGIN
// =========================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email first' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Incorrect password' });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// =========================================================
// FORGOT PASSWORD
// =========================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = makeOTP();

    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();

    await sendOTP(email, otp);

    res.json({ message: 'Reset OTP sent' });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
});

// =========================================================
// RESET PASSWORD
// =========================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.resetOtp || !user.resetOtpExpiry) {
      return res.status(400).json({ message: 'No reset request found' });
    }

    if (String(user.resetOtp).trim() !== String(otp).trim()) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.resetOtpExpiry) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    user.password = hash;
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;

    await user.save();

    res.json({ message: 'Password reset successful' });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Reset failed', error: err.message });
  }
});

module.exports = router;