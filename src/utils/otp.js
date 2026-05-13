const crypto = require('crypto');

const makeOTP = () => crypto.randomInt(100000, 1000000).toString();

const hashOTP = (otp) => {
  if (!otp) return '';
  return crypto
    .createHash('sha256')
    .update(`${otp}:${process.env.JWT_SECRET || ''}`)
    .digest('hex');
};

const matchesOTP = (stored, otp) => {
  if (!stored || !otp) return false;

  const normalized = String(otp).trim();
  const hashed = hashOTP(normalized);

  // Keeps older unhashed OTPs valid until they expire.
  return stored === hashed || String(stored).trim() === normalized;
};

module.exports = { makeOTP, hashOTP, matchesOTP };
