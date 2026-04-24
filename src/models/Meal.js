const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
  homeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Home', 
    required: true,
    index: true // ✅ faster queries
  },

  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true // ✅ faster queries
  },

  date: { 
    type: Date, 
    required: true 
  },

  mealCount: { 
    type: Number, 
    default: 0,
    min: 0 // ✅ prevent negative
  },

  eggsCount: { 
    type: Number, 
    default: 0,
    min: 0 // ✅ prevent negative
  }

}, { timestamps: true });


// ✅ Normalize date (VERY IMPORTANT for grouping by day)
mealSchema.pre('save', function(next) {
  if (this.date) {
    const d = new Date(this.date);
    d.setHours(0, 0, 0, 0); // remove time
    this.date = d;
  }
  next();
});


// ✅ Composite index (best for your queries)
mealSchema.index({ homeId: 1, date: 1 });

module.exports = mongoose.model('Meal', mealSchema);