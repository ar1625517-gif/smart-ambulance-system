const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialties: [String], // e.g., ['Cardiology', 'Trauma', 'General']
  erBedsAvailable: { type: Number, default: 5 },
  icuBedsAvailable: { type: Number, default: 2 },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  }
});

hospitalSchema.index({ location: '2dsphere' });
module.exports = mongoose.model('Hospital', hospitalSchema);