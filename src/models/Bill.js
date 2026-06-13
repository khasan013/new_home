const mongoose = require('mongoose');

const billBreakdownSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  name: String,
  email: String,
  meals: {
    type: Number,
    default: 0,
  },
  eggs: {
    type: Number,
    default: 0,
  },
  share: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const billSchema = new mongoose.Schema({
  homeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Home',
    required: true,
    index: true,
  },
  month: {
    type: String,
    required: true,
    trim: true,
  },
  periodStart: {
    type: Date,
    index: true,
  },
  periodEnd: {
    type: Date,
  },
  totalEggPrice: {
    type: Number,
    default: 0,
  },
  totalEggCount: {
    type: Number,
    default: 0,
  },
  consumedEgg: {
    type: Number,
    default: 0,
  },
  otherCost: {
    type: Number,
    default: 0,
  },
  totalMeals: {
    type: Number,
    default: 0,
  },
  totalBill: {
    type: Number,
    default: 0,
  },
  perEgg: {
    type: Number,
    default: 0,
  },
  perMeal: {
    type: Number,
    default: 0,
  },
  sentCount: {
    type: Number,
    default: 0,
  },
  failedCount: {
    type: Number,
    default: 0,
  },
  deliveryStatus: {
    type: String,
    enum: ['queued', 'sending', 'sent', 'partial', 'failed'],
    default: 'queued',
    index: true,
  },
  deliveryCompletedAt: {
    type: Date,
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  breakdown: [billBreakdownSchema],
  costSummary: {
    eggPrice: { type: Number, default: 0 },
    perEgg: { type: Number, default: 0 },
    consumedCost: { type: Number, default: 0 },
    remainingEggCost: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
}, { timestamps: true });

billSchema.index({ homeId: 1, createdAt: -1 });
billSchema.index({ homeId: 1, periodStart: -1 });

module.exports = mongoose.model('Bill', billSchema);
