const express = require('express');
const router = express.Router();
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');

router.post('/sos', async (req, res) => {
  try {
    const { lat, lng, emergencyType } = req.body;

    const nearestAmbulance = await Ambulance.findOne({
      status: 'available',
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 15000 // 15 km
        }
      }
    });

    if (!nearestAmbulance) {
      return res.status(404).json({ message: 'No available ambulances nearby.' });
    }

    const bestHospital = await Hospital.findOne({
      erBedsAvailable: { $gt: 0 },
      specialties: emergencyType,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 20000 // 20 km
        }
      }
    });

    nearestAmbulance.status = 'busy';
    await nearestAmbulance.save();

    res.json({
      tripId: `TRIP_${Date.now()}`,
      ambulance: nearestAmbulance,
      hospital: bestHospital
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;