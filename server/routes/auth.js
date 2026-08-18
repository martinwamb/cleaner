'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const { issueSession, clearSession, requireOperator } = require('../auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
});

const selectByEmail = db.prepare('SELECT * FROM operators WHERE email = ?');
const selectById = db.prepare('SELECT id, email, name FROM operators WHERE id = ?');

router.post('/auth/login', loginLimiter, async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');

  const operator = email ? selectByEmail.get(email) : null;
  // Compare against a dummy hash when the account is missing so that a bad
  // email and a bad password take the same amount of time to reject.
  const hash = operator ? operator.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(password, hash);

  if (!operator || !ok) return res.status(401).json({ error: 'Invalid email or password.' });

  issueSession(res, operator);
  res.json({ operator: { id: operator.id, email: operator.email, name: operator.name } });
});

router.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.status(204).end();
});

router.get('/auth/me', requireOperator, (req, res) => {
  const operator = selectById.get(req.operator.sub);
  if (!operator) return res.status(401).json({ error: 'Authentication required' });
  res.json({ operator });
});

module.exports = router;
