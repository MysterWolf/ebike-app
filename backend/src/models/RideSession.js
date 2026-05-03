const { randomUUID } = require('crypto');

const sessions = new Map();

class RideSession {
  constructor() {
    this.id = randomUUID();
    this.startTime = new Date().toISOString();
    this.endTime = null;
    this.duration = 0;       // seconds
    this.distance = 0;       // miles
    this.averageSpeed = 0;   // mph
    this.topSpeed = 0;       // mph
    this.status = 'active';
  }

  end({ distance, averageSpeed, topSpeed }) {
    this.endTime = new Date().toISOString();
    this.duration = Math.round((new Date(this.endTime) - new Date(this.startTime)) / 1000);
    this.distance = parseFloat(Number(distance).toFixed(2));
    this.averageSpeed = parseFloat(Number(averageSpeed).toFixed(1));
    this.topSpeed = parseFloat(Number(topSpeed).toFixed(1));
    this.status = 'completed';
    return this;
  }
}

const RideSessionStore = {
  create() {
    const session = new RideSession();
    sessions.set(session.id, session);
    return session;
  },

  findById(id) {
    return sessions.get(id) || null;
  },

  findAll() {
    return Array.from(sessions.values());
  },

  end(id, data) {
    const session = sessions.get(id);
    if (!session) return null;
    return session.end(data);
  },
};

module.exports = RideSessionStore;
