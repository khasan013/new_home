const mongoose = require('mongoose');

const penaltySchema = new mongoose.Schema({
  homeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Home',
    required: true,
    index: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 🔥 MUST MATCH ROUTE
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  reason: {
    type: String,
    default: ''
  }

}, { timestamps: true });

module.exports = mongoose.model('Penalty', penaltySchema);