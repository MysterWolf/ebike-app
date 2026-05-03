const express = require('express');
const cors = require('cors');
const ridesRouter = require('./routes/rides');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/rides', ridesRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
