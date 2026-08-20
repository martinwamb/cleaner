'use strict';

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');

const catalogRoutes = require('./routes/catalog');
const authRoutes = require('./routes/auth');
const requestRoutes = require('./routes/requests');
const serviceRoutes = require('./routes/services');
const rateCardRoutes = require('./routes/rate-cards');
const workflowRoutes = require('./routes/workflow');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT) || 4003;

// nginx terminates TLS and is the only thing in front of this process, so
// trust exactly one proxy hop for correct client IPs in the rate limiters.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', catalogRoutes);
app.use('/api', authRoutes);
app.use('/api', requestRoutes);
app.use('/api', serviceRoutes);
app.use('/api', rateCardRoutes);
app.use('/api', workflowRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`cleaner-server listening on 127.0.0.1:${port}`);
});
