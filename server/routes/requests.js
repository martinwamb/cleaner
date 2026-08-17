'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const { requireOperator } = require('../auth');
const { calculateEstimate, formatRange } = require('../pricing');
const { parseQuoteRequest, parseEstimateInput } = require('../validate');

const router = express.Router();

const STATUSES = ['New', 'Under Review', 'Quote Sent', 'Confirmed', 'Completed'];
const NEXT_STATUS = {
  New: 'Under Review',
  'Under Review': 'Quote Sent',
  'Quote Sent': 'Confirmed',
  Confirmed: 'Completed',
};

// A public form is a spam target; keep the write path cheap to defend.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from this address. Please try again later.' },
});

const estimateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many estimate lookups. Please slow down.' },
});

const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

/** Shape sent to the operator workspace. Includes customer contact details. */
const toOperatorRow = (row) => ({
  id: row.reference,
  customer: row.customer,
  organization: row.organization || 'Independent request',
  email: row.email,
  phone: row.phone,
  service: row.service,
  property: row.property,
  size: row.size,
  condition: row.condition,
  frequency: row.frequency,
  addOns: parseJson(row.add_ons, []),
  location: row.location,
  scope: row.scope,
  timing: row.timing,
  status: row.status,
  priority: row.priority,
  value: row.estimate_json
    ? formatRange({ low: row.estimate_low, high: row.estimate_high })
    : 'To be estimated',
  estimate: parseJson(row.estimate_json, null),
  created: row.created_at,
  updated: row.updated_at,
});

const insertRequest = db.prepare(`
  INSERT INTO requests (
    reference, customer, organization, email, phone, service, property, size,
    condition, frequency, add_ons, location, scope, timing, priority,
    estimate_low, estimate_high, estimate_json
  ) VALUES (
    @reference, @customer, @organization, @email, @phone, @service, @property, @size,
    @condition, @frequency, @addOns, @location, @scope, @timing, @priority,
    @estimateLow, @estimateHigh, @estimateJson
  )
`);

const selectById = db.prepare('SELECT * FROM requests WHERE id = ?');
const selectByReference = db.prepare('SELECT * FROM requests WHERE reference = ?');
const selectAll = db.prepare('SELECT * FROM requests ORDER BY created_at DESC, id DESC');
const updateReference = db.prepare('UPDATE requests SET reference = ? WHERE id = ?');
const updateStatus = db.prepare(
  "UPDATE requests SET status = ?, updated_at = datetime('now') WHERE id = ?",
);
const insertEvent = db.prepare(`
  INSERT INTO request_events (request_id, operator_id, from_status, to_status)
  VALUES (?, ?, ?, ?)
`);

// Reference is derived from the row id so it can never collide, unlike the old
// prototype's `REQ-${1050 + leads.length}`.
const createRequest = db.transaction((value, estimate) => {
  const info = insertRequest.run({
    reference: `pending-${Date.now()}-${Math.random()}`,
    customer: value.customer,
    organization: value.organization,
    email: value.email,
    phone: value.phone,
    service: value.service,
    property: value.property,
    size: value.size,
    condition: value.condition,
    frequency: value.frequency,
    addOns: JSON.stringify(value.addOns),
    location: value.location,
    scope: value.scope,
    timing: value.timing,
    priority: 'Normal',
    estimateLow: estimate ? estimate.low : null,
    estimateHigh: estimate ? estimate.high : null,
    estimateJson: estimate ? JSON.stringify(estimate) : null,
  });
  const id = Number(info.lastInsertRowid);
  const reference = `REQ-${1000 + id}`;
  updateReference.run(reference, id);
  return selectById.get(id);
});

router.post('/estimate', estimateLimiter, (req, res) => {
  const estimate = calculateEstimate(parseEstimateInput(req.body));
  res.json({ estimate });
});

router.post('/requests', submitLimiter, (req, res) => {
  const parsed = parseQuoteRequest(req.body);
  if (parsed.errors) return res.status(400).json({ errors: parsed.errors });

  const estimate = calculateEstimate(parsed.value);
  const row = createRequest(parsed.value, estimate);

  // The public response deliberately echoes back only this submission.
  res.status(201).json({
    reference: row.reference,
    status: row.status,
    estimate,
    value: formatRange(estimate),
  });
});

router.get('/requests', requireOperator, (req, res) => {
  res.json({ requests: selectAll.all().map(toOperatorRow) });
});

router.patch('/requests/:reference', requireOperator, (req, res) => {
  const row = selectByReference.get(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  const requested = req.body ? req.body.status : null;
  const status = requested === undefined || requested === null ? NEXT_STATUS[row.status] : requested;

  if (!status) return res.status(409).json({ error: `${row.status} is the final status.` });
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  if (status === row.status) return res.json({ request: toOperatorRow(row) });

  updateStatus.run(status, row.id);
  insertEvent.run(row.id, req.operator.sub, row.status, status);

  res.json({ request: toOperatorRow(selectById.get(row.id)) });
});

module.exports = router;
