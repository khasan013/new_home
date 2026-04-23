const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
  homeId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Home', required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: Date, required: true },
  mealCount: { type: Number, default: 0 },
  eggsCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Meal', mealSchema);