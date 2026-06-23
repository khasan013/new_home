const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  homeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Home',
    required: true,
    index: true
  },

  title: {
    type: String,
    required: true,
    trim: true
  },

  amount: {
    type: Number,
    required: true,
    min: 0
  },

  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 🔥 ADD THIS (REQUIRED FOR UI)
  category: {
    type: String,
    enum: ['Grocery', 'Egg', 'SharedBill', 'WaterSupply'],
    required: true,
    default: 'Grocery'
  },

  // 🔥 ADD THIS (FOR EGG COUNT)
  eggQty: {
    type: Number,
    default: 0,
    min: 0
  },

  splitEqually: {
    type: Boolean,
    default: false,
    index: true
  },

  bottlePrice: {
    type: Number,
    default: 0,
    min: 0
  },

  bottleQty: {
    type: Number,
    default: 0,
    min: 0
  }

}, { timestamps: true });


// 🔥 Optional (but good): fast queries
expenseSchema.index({ homeId: 1, createdAt: -1 });
expenseSchema.index({ homeId: 1, paidBy: 1, createdAt: -1 });
expenseSchema.index({ homeId: 1, category: 1, createdAt: -1 });
expenseSchema.index({ homeId: 1, splitEqually: 1, createdAt: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
