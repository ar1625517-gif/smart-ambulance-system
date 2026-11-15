const mongoose = require('mongoose');
const Ambulance = require('./models/Ambulance');
const Hospital = require('./models/Hospital');

// Coordinates centered around Bengaluru (MG Road area)
const sampleAmbulances = [
  { vehicleNumber: 'KA-01-EM-101', driverName: 'Ramesh Kumar', type: 'ALS', status: 'available', location: { type: 'Point', coordinates: [77.6068, 12.9756] } },
  { vehicleNumber: 'KA-01-EM-102', driverName: 'Suresh Nair', type: 'BLS', status: 'available', location: { type: 'Point', coordinates: [77.6190, 12.9716] } },
  { vehicleNumber: 'KA-01-EM-103', driverName: 'Anita Rao', type: 'ALS', status: 'available', location: { type: 'Point', coordinates: [77.5946, 12.9716] } }
];

const sampleHospitals = [
  { name: 'Apollo Emergency & Heart Center', specialties: ['Cardiology', 'Trauma', 'General'], erBedsAvailable: 4, icuBedsAvailable: 2, location: { type: 'Point', coordinates: [77.6120, 12.9810] } },
  { name: 'Manipal Trauma & Neuro Care', specialties: ['Trauma', 'Neurology', 'General'], erBedsAvailable: 6, icuBedsAvailable: 3, location: { type: 'Point', coordinates: [77.5980, 12.9680] } }
];

mongoose.connect('mongodb://127.0.0.1:27017/ambulance_db')
  .then(async () => {
    await Ambulance.deleteMany({});
    await Hospital.deleteMany({});
    await Ambulance.insertMany(sampleAmbulances);
    await Hospital.insertMany(sampleHospitals);
    console.log('Database seeded with sample ambulances and hospitals!');
    process.exit();
  })
  .catch(err => console.error(err));