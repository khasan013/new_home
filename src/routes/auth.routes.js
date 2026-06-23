const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const { sendOTP } = require('../utils/sendEmail');
const { makeOTP, hashOTP, matchesOTP } = require('../utils/otp');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 25, keyPrefix: 'auth' });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, keyPrefix: 'otp' });
const OTP_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '90d';
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function signAuthToken(user) {
  return jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function authPayload(user, message) {
  const payload = {
    token: signAuthToken(user),
    expiresIn: TOKEN_TTL,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    user: publicUser(user)
  };
  if (message) payload.message = message;
  return payload;
}

function publicUser(user) {
  return {
    userId: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName
  };
}

// ── Helper: generate 6-digit OTP ──────────────────────────
// makeOTP is imported from utils/otp so OTP generation uses crypto.randomInt.

// =========================================================
// REGISTER
// =========================================================
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { password, firstName, lastName } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email || !password || !firstName) {
      return res.status(400).json({ message: 'Email, password and first name are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      if (!existing.isVerified) {
        await User.deleteOne({ _id: existing._id, isVerified: false });
      } else {
      return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const otp  = makeOTP();
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    const pending = await PendingRegistration.findOneAndUpdate(
      { email },
      {
        email,
        password: hash,
        firstName,
        lastName,
        otp: hashOTP(otp),
        otpExpiry,
        expiresAt: otpExpiry,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await sendOTP(email, otp);
    } catch (emailError) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      throw emailError;
    }

    res.json({ message: 'Verification code sent. Verify your email to create your account.' });

  } catch (err) {
    console.error('Registration failed:', {
      message: err?.message || err,
      stack: err?.stack || err,
    });
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// =========================================================
// VERIFY EMAIL OTP
// =========================================================
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { otp } = req.body;

    const pending = await PendingRegistration.findOne({ email });
    const existingUser = await User.findOne({ email });

    if (existingUser?.isVerified) {
      return res.status(400).json({ message: 'Already verified' });
    }

    if (pending) {
      if (!matchesOTP(pending.otp, otp)) {
        return res.status(400).json({ message: 'Invalid OTP' });
      }

      if (new Date() > pending.otpExpiry) {
        await PendingRegistration.deleteOne({ _id: pending._id });
        return res.status(400).json({ message: 'OTP expired' });
      }

      const user = existingUser || await User.create({
        email: pending.email,
        password: pending.password,
        firstName: pending.firstName,
        lastName: pending.lastName,
        isVerified: true,
      });

      if (existingUser) {
        existingUser.password = pending.password;
        existingUser.firstName = pending.firstName;
        existingUser.lastName = pending.lastName;
        existingUser.isVerified = true;
        existingUser.otp = undefined;
        existingUser.otpExpiry = undefined;
        await existingUser.save();
      }

      await PendingRegistration.deleteOne({ _id: pending._id });

      return res.json(authPayload(user, 'Email verified. Account created.'));
    }

    const user = existingUser;
    if (!user) return res.status(404).json({ message: 'No pending registration found. Please register again.' });

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: 'No OTP found. Please register again.' });
    }

    if (!matchesOTP(user.otp, otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiry) {
      await User.deleteOne({ _id: user._id, isVerified: false });
      return res.status(400).json({ message: 'OTP expired' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    return res.json(authPayload(user, 'Email verified'));

  } catch (err) {
    console.error('Verify OTP failed:', {
      message: err?.message || err,
      stack: err?.stack || err,
    });
    res.status(500).json({ message: 'Verification failed', error: err.message });
  }
});

// =========================================================
// RESEND OTP
// =========================================================
router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    const existingUser = await User.findOne({ email });
    if (existingUser?.isVerified) {
      return res.status(400).json({ message: 'Already verified' });
    }

    const pending = await PendingRegistration.findOne({ email });
    if (!pending && !existingUser) {
      return res.status(404).json({ message: 'No pending registration found. Please register again.' });
    }

    const otp = makeOTP();
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    const previousPending = pending
      ? { otp: pending.otp, otpExpiry: pending.otpExpiry, expiresAt: pending.expiresAt }
      : null;
    const previousUser = existingUser
      ? { otp: existingUser.otp, otpExpiry: existingUser.otpExpiry }
      : null;

    if (pending) {
      pending.otp = hashOTP(otp);
      pending.otpExpiry = otpExpiry;
      pending.expiresAt = otpExpiry;
      await pending.save();
    } else {
      existingUser.otp = hashOTP(otp);
      existingUser.otpExpiry = otpExpiry;
      await existingUser.save();
    }

    try {
      await sendOTP(email, otp);
    } catch (emailError) {
      if (pending && previousPending) {
        pending.otp = previousPending.otp;
        pending.otpExpiry = previousPending.otpExpiry;
        pending.expiresAt = previousPending.expiresAt;
        await pending.save();
      } else if (existingUser && previousUser) {
        existingUser.otp = previousUser.otp;
        existingUser.otpExpiry = previousUser.otpExpiry;
        await existingUser.save();
      }
      throw emailError;
    }

    res.json({ message: 'New OTP sent' });

  } catch (err) {
    console.error('Resend OTP failed:', {
      message: err?.message || err,
      stack: err?.stack || err,
    });
    res.status(500).json({ message: 'Resend failed', error: err.message });
  }
});

// =========================================================
// LOGIN
// =========================================================
router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email first' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Incorrect password' });

    res.json(authPayload(user));

  } catch (err) {
    console.error('Login failed:', {
      message: err?.message || err,
      stack: err?.stack || err,
    });
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// =========================================================
// CURRENT USER
// =========================================================
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('email firstName lastName isVerified')
      .lean();

    if (!user || !user.isVerified) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user', error: err.message });
  }
});

// =========================================================
// FORGOT PASSWORD
// =========================================================
router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = makeOTP();

    user.resetOtp = hashOTP(otp);
    user.resetOtpExpiry = new Date(Date.now() + OTP_TTL_MS);

    await user.save();

    try {
      await sendOTP(email, otp, { purpose: 'password-reset' });
    } catch (emailError) {
      user.resetOtp = undefined;
      user.resetOtpExpiry = undefined;
      await user.save();
      throw emailError;
    }

    res.json({ message: 'Reset OTP sent' });

  } catch (err) {
    console.error('Forgot password OTP failed:', {
      message: err?.message || err,
      stack: err?.stack || err,
    });
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
});

// =========================================================
// RESET PASSWORD
// =========================================================
router.post('/reset-password', otpLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and new password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.resetOtp || !user.resetOtpExpiry) {
      return res.status(400).json({ message: 'No reset request found' });
    }

    if (!matchesOTP(user.resetOtp, otp)) {
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
    console.error('Reset password failed:', {
      message: err?.message || err,
      stack: err?.stack || err,
    });
    res.status(500).json({ message: 'Reset failed', error: err.message });
  }
});

module.exports = router;
