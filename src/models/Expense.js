const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  homeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Home',  required: true },
  title:  { type: String, required: true },
  amount: { type: Number, required: true },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);