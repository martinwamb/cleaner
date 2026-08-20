'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const { requireOperator } = require('../auth');
const { calculateEstimate, formatRange } = require('../pricing');
const { parseQuoteRequest, parseEstimateInput } = require('../validate');

const router = express.Router();

const STATUSES = ['New', 'Qualifying', 'Waiting for Customer', 'Assessment Needed', 'Assessment Complete', 'Quote Draft', 'Quote Sent', 'Follow-up Due', 'Accepted', 'Scheduling', 'Scheduled', 'In Progress', 'Needs Approval', 'Quality Check', 'Completed', 'Unsupported', 'Declined', 'Expired', 'Cancelled'];
const LEGACY_STATUS = { 'Under Review': 'Qualifying', Confirmed: 'Scheduled' };
const ALLOWED_TRANSITIONS = {
  New: ['Qualifying', 'Unsupported', 'Cancelled'],
  Qualifying: ['Waiting for Customer', 'Assessment Needed', 'Unsupported', 'Cancelled'],
  'Waiting for Customer': ['Qualifying', 'Assessment Needed', 'Declined', 'Cancelled'],
  'Assessment Needed': ['Assessment Complete', 'Waiting for Customer', 'Cancelled'],
  'Assessment Complete': ['Quote Draft', 'Assessment Needed', 'Cancelled'],
  'Quote Draft': ['Quote Sent', 'Assessment Needed', 'Cancelled'],
  'Quote Sent': ['Follow-up Due', 'Accepted', 'Declined', 'Expired', 'Cancelled'],
  'Follow-up Due': ['Quote Sent', 'Accepted', 'Declined', 'Expired', 'Cancelled'],
  Accepted: ['Scheduling', 'Cancelled'],
  Scheduling: ['Scheduled', 'Accepted', 'Cancelled'],
  Scheduled: ['In Progress', 'Scheduling', 'Cancelled'],
  'In Progress': ['Needs Approval', 'Quality Check', 'Cancelled'],
  'Needs Approval': ['In Progress', 'Quality Check', 'Cancelled'],
  'Quality Check': ['Completed', 'Needs Approval'],
  Completed: [], Unsupported: [], Declined: [], Expired: [], Cancelled: [],
};
const nextActionFor = (status) => ({
  New: 'Review request', Qualifying: 'Choose assessment path', 'Waiting for Customer': 'Review customer response',
  'Assessment Needed': 'Complete assessment', 'Assessment Complete': 'Prepare quote', 'Quote Draft': 'Send quote',
  'Quote Sent': 'Follow up with customer', 'Follow-up Due': 'Record customer decision', Accepted: 'Schedule work',
  Scheduling: 'Confirm schedule', Scheduled: 'Prepare field handoff', 'In Progress': 'Complete quality check',
  'Needs Approval': 'Resolve scope change', 'Quality Check': 'Complete job', Completed: 'Review repeat potential',
}[status] || 'Review request');
const NEXT_STATUS = {
  New: 'Qualifying',
  'Under Review': 'Assessment Needed',
  Qualifying: 'Assessment Needed',
  'Assessment Needed': 'Assessment Complete',
  'Assessment Complete': 'Quote Draft',
  'Quote Draft': 'Quote Sent',
  'Quote Sent': 'Follow-up Due',
  'Follow-up Due': 'Accepted',
  Confirmed: 'Completed',
  Accepted: 'Scheduling',
  Scheduling: 'Scheduled',
  Scheduled: 'In Progress',
  'In Progress': 'Quality Check',
  'Quality Check': 'Completed',
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
  status: LEGACY_STATUS[row.status] || row.status,
  allowedTransitions: ALLOWED_TRANSITIONS[LEGACY_STATUS[row.status] || row.status] || [],
  priority: row.priority,
  value: row.estimate_json
    ? formatRange({ low: row.estimate_low, high: row.estimate_high })
    : 'To be estimated',
  estimate: parseJson(row.estimate_json, null),
  assessmentType: row.assessment_type || 'quick',
  assessmentStatus: row.assessment_status || 'Not started',
  assessmentConfidence: row.assessment_confidence || 'Unassessed',
  accessNotes: row.access_notes || '',
  lastCleaned: row.last_cleaned || '',
  customerExpectations: row.customer_expectations || '',
  nextAction: row.next_action || nextActionFor(LEGACY_STATUS[row.status] || row.status),
  nextActionDue: row.next_action_due || '',
  nextActionOwner: row.next_action_owner || 'Operator',
  quoteStatus: row.quote_status || 'Not started',
  quoteNotes: row.quote_notes || '',
  activity: selectEvents.all(row.id),
  created: row.created_at,
  updated: row.updated_at,
});

const insertRequest = db.prepare(`
  INSERT INTO requests (
    reference, customer, organization, email, phone, service, property, size,
    condition, frequency, add_ons, location, scope, timing, priority,
    estimate_low, estimate_high, estimate_json, assessment_type, access_notes,
    last_cleaned, customer_expectations
  ) VALUES (
    @reference, @customer, @organization, @email, @phone, @service, @property, @size,
    @condition, @frequency, @addOns, @location, @scope, @timing, @priority,
    @estimateLow, @estimateHigh, @estimateJson, @assessmentType, @accessNotes,
    @lastCleaned, @customerExpectations
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
  INSERT INTO request_events (request_id, operator_id, from_status, to_status, event_type, channel, note)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const selectEvents = db.prepare('SELECT event_type AS type, channel, note, from_status AS fromStatus, to_status AS toStatus, created_at AS created FROM request_events WHERE request_id = ? ORDER BY created_at DESC, id DESC');

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
    assessmentType: value.assessmentType,
    accessNotes: value.accessNotes,
    lastCleaned: value.lastCleaned,
    customerExpectations: value.customerExpectations,
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

  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const requested = input.status;
  const currentStatus = LEGACY_STATUS[row.status] || row.status;
  const requestedStatus = requested === undefined || requested === null ? NEXT_STATUS[currentStatus] : requested;
  const status = LEGACY_STATUS[requestedStatus] || requestedStatus;

  const operationalFields = {
    assessmentType: ['assessment_type', ['quick', 'photos', 'video', 'walkthrough', 'formal-survey']],
    assessmentStatus: ['assessment_status'],
    assessmentConfidence: ['assessment_confidence'],
    accessNotes: ['access_notes'],
    lastCleaned: ['last_cleaned'],
    customerExpectations: ['customer_expectations'],
    nextAction: ['next_action'],
    nextActionDue: ['next_action_due'],
    nextActionOwner: ['next_action_owner'],
    quoteStatus: ['quote_status'],
    quoteNotes: ['quote_notes'],
  };
  const updates = [];
  const values = [];
  for (const [field, [column, allowed]] of Object.entries(operationalFields)) {
    if (input[field] === undefined) continue;
    if (allowed && !allowed.includes(input[field])) return res.status(400).json({ error: `Unknown ${field}.` });
    updates.push(`${column} = ?`);
    values.push(String(input[field] || '').trim());
  }

  if (!status && !updates.length) return res.status(409).json({ error: `${currentStatus} is the final status.` });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  if (status !== currentStatus && requested !== undefined && requested !== null && !ALLOWED_TRANSITIONS[currentStatus]?.includes(status)) {
    return res.status(409).json({ error: `Cannot move ${currentStatus} directly to ${status}.`, allowedTransitions: ALLOWED_TRANSITIONS[currentStatus] || [] });
  }
  if (status === currentStatus) {
    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      values.push(row.id);
      db.prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    if (input.activityNote) insertEvent.run(row.id, req.operator.sub, currentStatus, currentStatus, 'note', input.activityChannel || 'internal', String(input.activityNote).trim());
    return res.json({ request: toOperatorRow(selectById.get(row.id)) });
  }

  updates.unshift('status = ?');
  values.unshift(status);
  updates.push("updated_at = datetime('now')");
  values.push(row.id);
  db.prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  insertEvent.run(row.id, req.operator.sub, currentStatus, status, 'status', input.activityChannel || 'internal', input.activityNote || '');

  res.json({ request: toOperatorRow(selectById.get(row.id)) });
});

module.exports = router;
