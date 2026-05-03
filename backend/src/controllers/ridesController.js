const RideSessionStore = require('../models/RideSession');

const SPEED_LIMIT_MPH = 28;

exports.startRide = (_req, res) => {
  const session = RideSessionStore.create();
  res.status(201).json(session);
};

exports.endRide = (req, res) => {
  const { id } = req.params;
  const { distance, averageSpeed, topSpeed } = req.body;

  if (distance == null || averageSpeed == null || topSpeed == null) {
    return res.status(400).json({ error: 'distance, averageSpeed, and topSpeed are required' });
  }

  const session = RideSessionStore.end(id, { distance, averageSpeed, topSpeed });
  if (!session) {
    return res.status(404).json({ error: 'Ride session not found' });
  }

  const response = { session };
  if (session.topSpeed > SPEED_LIMIT_MPH) {
    response.warning = `Top speed of ${session.topSpeed} mph exceeded the ${SPEED_LIMIT_MPH} mph limit`;
  }

  res.json(response);
};

exports.getRide = (req, res) => {
  const session = RideSessionStore.findById(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Ride session not found' });
  }
  res.json(session);
};

exports.getAllRides = (_req, res) => {
  res.json(RideSessionStore.findAll());
};
