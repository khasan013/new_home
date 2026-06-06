const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
  homeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Home',
    required: true,
    unique: true,
    index: true,
  },
  caretakerName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  caretakerPhone: {
    type: String,
    trim: true,
    default: '',
    maxlength: 30,
  },
  gasProviderName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  gasProviderPhone: {
    type: String,
    trim: true,
    default: '',
    maxlength: 30,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
