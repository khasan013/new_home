const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
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

  date: {
    type: Date,
    required: true
  },

  mealCount: {
    type: Number,
    default: 0,
    min: 0
  },

  eggsCount: {
    type: Number,
    default: 0,
    min: 0
  }

}, { timestamps: true });

// ✅ FIXED PRE SAVE HOOK (NO next)
mealSchema.pre('save', function () {
  if (this.date) {
    const d = new Date(this.date);
    d.setHours(0, 0, 0, 0);
    this.date = d;
  }
});

mealSchema.index({ homeId: 1, date: 1 });

module.exports = mongoose.model('Meal', mealSchema);