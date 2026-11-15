const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema({
  vehicleNumber: { type: String, required: true, unique: true },
  driverName: String,
  type: { type: String, enum: ['BLS', 'ALS'], default: 'ALS' },
  status: { type: String, enum: ['available', 'busy', 'offline'], default: 'available' },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  }
});

ambulanceSchema.index({ location: '2dsphere' });
module.exports = mongoose.model('Ambulance', ambulanceSchema);