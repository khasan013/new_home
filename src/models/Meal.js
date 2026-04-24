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
  },

  // 🔥 Penalty support
  isPenalty: {
    type: Boolean,
    default: false
  },

  penaltyReason: {
    type: String,
    default: ''
  }

}, { timestamps: true });


// 🔥 Normalize date (for save)
function normalizeDate(next) {
  if (this.date) {
    const d = new Date(this.date);
    d.setHours(0, 0, 0, 0);
    this.date = d;
  }
  next();
}

// ✅ Apply to create
mealSchema.pre('save', normalizeDate);


// ✅ FIXED: Apply to update (NO next)
mealSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();

  if (update && update.date) {
    const d = new Date(update.date);
    d.setHours(0, 0, 0, 0);
    update.date = d;
  }
});


// 🔥 Prevent duplicate entries (same user + same day + same home)
mealSchema.index(
  { homeId: 1, userId: 1, date: 1 },
  { unique: true }
);


// 🔥 Query performance
mealSchema.index({ homeId: 1, date: 1 });

module.exports = mongoose.model('Meal', mealSchema);