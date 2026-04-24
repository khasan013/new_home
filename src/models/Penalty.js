// models/Penalty.js
const mongoose = require('mongoose');

const penaltySchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Home', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },   // number of penalty meals
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Penalty', penaltySchema);