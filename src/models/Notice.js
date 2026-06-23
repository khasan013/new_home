const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
  },
  category: {
    type: String,
    enum: ['general', 'emergency', 'waterSupply'],
    required: true,
    default: 'general',
  },
  bottlePrice: {
    type: Number,
    default: 0,
    min: 0,
  },
  bottleQty: {
    type: Number,
    default: 0,
    min: 0,
  },
  waterTotal: {
    type: Number,
    default: 0,
    min: 0,
  },
  expenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  postedByName: {
    type: String,
    required: true,
    trim: true,
  },
  homeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Home',
    required: true,
    index: true,
  },
}, { timestamps: true });

noticeSchema.index({ homeId: 1, category: 1, createdAt: -1 });

module.exports = mongoose.model('Notice', noticeSchema);
