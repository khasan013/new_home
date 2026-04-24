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
    min: 0,
    validate: {
      validator: Number.isFinite,
      message: 'mealCount must be a valid number'
    }
  },

  eggsCount: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isFinite,
      message: 'eggsCount must be a valid number'
    }
  }

}, { timestamps: true });

// Normalize date
mealSchema.pre('save', function(next) {
  if (this.date) {
    const d = new Date(this.date);
    d.setHours(0, 0, 0, 0);
    this.date = d;
  }
  next();
});

module.exports = mongoose.model('Meal', mealSchema);