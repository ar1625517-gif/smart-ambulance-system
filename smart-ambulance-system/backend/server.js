const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { MongoMemoryServer } = require('mongodb-memory-server');
const dispatchRoutes = require('./routes/dispatch');
const Ambulance = require('./models/Ambulance');
const Hospital = require('./models/Hospital');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/dispatch', dispatchRoutes);

app.get('/', (req, res) => res.send('Ambulance Dispatch Server is Running!'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('join_trip', (tripId) => socket.join(tripId));
  socket.on('driver_location_update', ({ tripId, lat, lng, etaMinutes }) => {
    io.to(tripId).emit('live_location', { lat, lng, etaMinutes });
  });
  socket.on('send_vitals', ({ tripId, vitals }) => {
    io.to(tripId).emit('er_vitals_alert', vitals);
  });
});

async function startServer() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  console.log('Database Connected!');

  await Ambulance.insertMany([
    { vehicleNumber: 'KA-01-EM-101', driverName: 'Ramesh Kumar', type: 'ALS', status: 'available', location: { type: 'Point', coordinates: [77.6068, 12.9756] } },
    { vehicleNumber: 'KA-01-EM-102', driverName: 'Suresh Nair', type: 'BLS', status: 'available', location: { type: 'Point', coordinates: [77.6190, 12.9716] } }
  ]);
  await Hospital.insertMany([
    { name: 'Apollo Emergency & Heart Center', specialties: ['Cardiology', 'Trauma', 'General'], erBedsAvailable: 4, icuBedsAvailable: 2, location: { type: 'Point', coordinates: [77.6120, 12.9810] } },
    { name: 'Manipal Trauma & Neuro Care', specialties: ['Trauma', 'Neurology', 'General'], erBedsAvailable: 6, icuBedsAvailable: 3, location: { type: 'Point', coordinates: [77.5980, 12.9680] } }
  ]);
  console.log('Sample Ambulances & Hospitals Loaded!');

  server.listen(5000, () => console.log('Server running on http://localhost:5000'));
}

startServer();