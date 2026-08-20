'use strict';

const express = require('express');
const db = require('../db');
const { requireOperator } = require('../auth');

const router = express.Router();
const json = (value, fallback = []) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const text = (value, max = 4000) => String(value == null ? '' : value).trim().slice(0, max);
const requestFor = (reference) => db.prepare('SELECT * FROM requests WHERE reference = ?').get(reference);
const jobFor = (reference) => db.prepare(`
  SELECT j.*, r.reference, r.customer, r.service, r.property, r.location, r.scope,
    r.access_notes, r.customer_expectations, r.timing, q.id AS quote_id
  FROM jobs j JOIN requests r ON r.id = j.request_id
  LEFT JOIN quotes q ON q.request_id = r.id
  WHERE r.reference = ?
`).get(reference);
const recordEvent = db.prepare(`
  INSERT INTO request_events (request_id, operator_id, from_status, to_status, event_type, channel, note)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const shelved = (res, feature) => res.status(410).json({
  error: `${feature} is shelved for the MVP acceptance workflow.`,
  status: 'Shelved for MVP',
});

function ensureCustomerProperty(row) {
  let customer = row.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id) : null;
  if (!customer) {
    customer = db.prepare('SELECT * FROM customers WHERE lower(email) = lower(?) LIMIT 1').get(row.email);
  }
  if (!customer) {
    const result = db.prepare('INSERT INTO customers (name, organization, email, phone) VALUES (?, ?, ?, ?)')
      .run(row.customer, row.organization || '', row.email, row.phone || '');
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare("UPDATE customers SET name = ?, organization = ?, phone = ?, updated_at = datetime('now') WHERE id = ?")
      .run(row.customer, row.organization || customer.organization, row.phone || customer.phone, customer.id);
  }

  let property = row.property_id ? db.prepare('SELECT * FROM properties WHERE id = ?').get(row.property_id) : null;
  if (!property) {
    property = db.prepare('SELECT * FROM properties WHERE customer_id = ? AND address = ? LIMIT 1').get(customer.id, row.location);
  }
  if (!property) {
    const result = db.prepare('INSERT INTO properties (customer_id, label, address, property_type, access_notes) VALUES (?, ?, ?, ?, ?)')
      .run(customer.id, row.property || row.location, row.location, row.property || '', row.access_notes || '');
    property = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare("UPDATE properties SET customer_id = ?, label = ?, property_type = ?, access_notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(customer.id, row.property || property.label, row.property || property.property_type, row.access_notes || property.access_notes, property.id);
  }
  db.prepare('UPDATE requests SET customer_id = ?, property_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(customer.id, property.id, row.id);
  return { customer, property };
}

function ensureQuote(row, operatorId) {
  let quote = db.prepare('SELECT * FROM quotes WHERE request_id = ?').get(row.id);
  if (!quote) {
    const result = db.prepare('INSERT INTO quotes (request_id) VALUES (?)').run(row.id);
    quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid);
    db.prepare(`INSERT INTO quote_versions
      (quote_id, version, service, scope, add_ons, estimate_low, estimate_high, pricing_snapshot)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?)`)
      .run(quote.id, row.service, row.scope || '', row.add_ons || '[]', row.estimate_low, row.estimate_high, row.estimate_json || '{}');
  }
  return quote;
}

function serializeWorkflow(row) {
  const ids = ensureCustomerProperty(row);
  const quote = ensureQuote(row, null);
  const versions = db.prepare('SELECT * FROM quote_versions WHERE quote_id = ? ORDER BY version DESC').all(quote.id).map((item) => ({ ...item, addOns: json(item.add_ons), pricingSnapshot: json(item.pricing_snapshot, {}) }));
  const assessments = db.prepare('SELECT * FROM assessments WHERE request_id = ? ORDER BY id DESC').all(row.id).map((item) => ({ ...item, evidence: json(item.evidence) }));
  const conversations = db.prepare('SELECT id, channel, direction, subject, body, external_ref AS externalRef, created_at AS created FROM conversations WHERE request_id = ? ORDER BY id DESC').all(row.id);
  const followUps = db.prepare('SELECT id, action, due_at AS dueAt, status, completed_at AS completedAt, note FROM follow_ups WHERE request_id = ? ORDER BY due_at ASC, id DESC').all(row.id);
  const job = jobFor(row.reference);
  let jobData = null;
  if (job) {
    const appointment = db.prepare('SELECT *, access_confirmed AS accessConfirmed, requested_window AS requestedWindow, confirmed_window AS confirmedWindow FROM appointments WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(job.id);
    const handoff = db.prepare('SELECT *, assigned_team AS assignedTeam, accepted_scope AS acceptedScope, customer_expectations AS customerExpectations, access_notes AS accessNotes FROM handoffs WHERE job_id = ?').get(job.id);
    const variances = db.prepare('SELECT *, price_delta AS priceDelta, time_delta AS timeDelta, customer_decision AS customerDecision, decided_at AS decidedAt FROM scope_variances WHERE job_id = ? ORDER BY id DESC').all(job.id);
    const quality = db.prepare('SELECT *, reviewed_at AS reviewedAt FROM quality_reviews WHERE job_id = ?').get(job.id);
    const completion = db.prepare('SELECT *, completed_at AS completedAt, customer_signoff AS customerSignoff, repeat_recommended AS repeatRecommended, next_recommended_date AS nextRecommendedDate, issue_followup AS issueFollowup FROM completion_records WHERE job_id = ?').get(job.id);
    jobData = { ...job, appointment, handoff, variances, quality: quality ? { ...quality, checklist: json(quality.checklist), evidence: json(quality.evidence) } : null, completion: completion ? { ...completion, evidence: json(completion.evidence), repeatRecommended: Boolean(completion.repeatRecommended) } : null };
  }
  return { customer: ids.customer, property: ids.property, assessments, quote: { ...quote, versions }, conversations, followUps, job: jobData };
}

router.get('/requests/:reference/workflow', requireOperator, (req, res) => {
  const row = requestFor(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  res.json({ workflow: serializeWorkflow(row) });
});

router.post('/requests/:reference/assessments', requireOperator, (req, res) => {
  const row = requestFor(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  const input = req.body || {};
  const type = ['quick', 'photos', 'video', 'walkthrough', 'formal-survey'].includes(input.type) ? input.type : row.assessment_type;
  const status = ['Requested', 'In progress', 'Complete'].includes(input.status) ? input.status : 'Requested';
  const result = db.prepare(`INSERT INTO assessments (request_id, type, status, confidence, findings, measurements, evidence, assessor_id, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'Complete' THEN datetime('now') ELSE NULL END)`)
    .run(row.id, type, status, text(input.confidence, 40) || 'Unassessed', text(input.findings), text(input.measurements), JSON.stringify(Array.isArray(input.evidence) ? input.evidence.slice(0, 20) : []), req.operator.sub, status);
  db.prepare("UPDATE requests SET assessment_type = ?, assessment_status = ?, assessment_confidence = ?, updated_at = datetime('now') WHERE id = ?")
    .run(type, status, text(input.confidence, 40) || 'Unassessed', row.id);
  recordEvent.run(row.id, req.operator.sub, row.status, row.status, 'assessment', 'internal', text(input.findings || `Assessment ${status.toLowerCase()}.`, 1000));
  res.status(201).json({ assessment: db.prepare('SELECT * FROM assessments WHERE id = ?').get(result.lastInsertRowid) });
});

router.post('/requests/:reference/quotes', requireOperator, (req, res) => {
  const row = requestFor(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  const input = req.body || {};
  const quote = ensureQuote(row, req.operator.sub);
  const current = db.prepare('SELECT * FROM quote_versions WHERE quote_id = ? ORDER BY version DESC LIMIT 1').get(quote.id);
  const version = Number(current?.version || 0) + 1;
  const result = db.prepare(`INSERT INTO quote_versions
    (quote_id, version, service, scope, inclusions, exclusions, assumptions, add_ons, pricing_snapshot, estimate_low, estimate_high, amount, rate_card_version, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(quote.id, version, row.service, text(input.scope ?? row.scope), text(input.inclusions), text(input.exclusions), text(input.assumptions), JSON.stringify(Array.isArray(input.addOns) ? input.addOns : json(row.add_ons)), JSON.stringify(input.pricingSnapshot || json(row.estimate_json, {})), input.estimateLow ?? row.estimate_low, input.estimateHigh ?? row.estimate_high, input.amount ?? null, text(input.rateCardVersion, 80), req.operator.sub);
  db.prepare("UPDATE quotes SET current_version = ?, status = 'Draft', updated_at = datetime('now') WHERE id = ?").run(version, quote.id);
  db.prepare("UPDATE requests SET quote_status = 'Draft', quote_notes = ?, updated_at = datetime('now') WHERE id = ?").run(text(input.notes), row.id);
  res.status(201).json({ quoteId: quote.id, quote: db.prepare('SELECT * FROM quote_versions WHERE id = ?').get(result.lastInsertRowid) });
});

router.patch('/quotes/:id', requireOperator, (req, res) => {
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const input = req.body || {};
  const statuses = ['Draft', 'Sent', 'Follow-up due', 'Accepted', 'Declined', 'Expired', 'Revised'];
  if (input.status && !statuses.includes(input.status)) return res.status(400).json({ error: 'Unknown quote status.' });
  const status = input.status || quote.status;
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(quote.request_id);
  if (status === 'Accepted') {
    const version = db.prepare('SELECT * FROM quote_versions WHERE quote_id = ? ORDER BY version DESC LIMIT 1').get(quote.id);
    const commercial = /commercial|office|retail|medical|school|facility/i.test(`${row.service} ${row.property}`);
    const assessmentReady = !commercial && row.assessment_type === 'quick'
      || db.prepare("SELECT 1 FROM assessments WHERE request_id = ? AND status = 'Complete' LIMIT 1").get(row.id);
    if (!assessmentReady) return res.status(409).json({ error: 'Complete the required assessment before accepting the job.' });
    if (!version || !text(version.scope) || !text(version.inclusions) || !text(version.exclusions) || !text(version.assumptions) || !text(version.rate_card_version)) {
      return res.status(409).json({ error: 'Complete scope, inclusions, exclusions, assumptions, and pricing version before accepting the job.' });
    }
    if (!text(input.decisionNote)) return res.status(400).json({ error: 'Record customer acceptance evidence before accepting the job.' });
  }
  db.prepare("UPDATE quotes SET status = ?, sent_at = CASE WHEN ? = 'Sent' THEN datetime('now') ELSE sent_at END, decided_at = CASE WHEN ? IN ('Accepted', 'Declined') THEN datetime('now') ELSE decided_at END, decision_note = ?, acceptance_channel = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, status, status, text(input.decisionNote), text(input.acceptanceChannel, 40) || (status === 'Accepted' ? 'operator-recorded' : ''), quote.id);
  db.prepare("UPDATE requests SET quote_status = ?, updated_at = datetime('now') WHERE id = ?").run(status, row.id);
  res.json({ quote: db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote.id) });
});

router.post('/requests/:reference/conversations', requireOperator, (req, res) => {
  return shelved(res, 'Conversation integrations');
  /* istanbul ignore next -- preserved for future reactivation */
  const row = requestFor(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  const input = req.body || {};
  const body = text(input.body, 4000);
  if (!body) return res.status(400).json({ error: 'Conversation note is required.' });
  const result = db.prepare('INSERT INTO conversations (request_id, operator_id, channel, direction, subject, body, external_ref) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(row.id, req.operator.sub, text(input.channel, 30) || 'internal', text(input.direction, 20) || 'internal', text(input.subject, 160), body, text(input.externalRef, 160));
  recordEvent.run(row.id, req.operator.sub, row.status, row.status, 'conversation', text(input.channel, 30) || 'internal', body);
  res.status(201).json({ conversation: db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid) });
});

router.post('/requests/:reference/follow-ups', requireOperator, (req, res) => {
  return shelved(res, 'Follow-up queue');
  /* istanbul ignore next -- preserved for future reactivation */
  const row = requestFor(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  const input = req.body || {};
  if (!text(input.action, 200) || !text(input.dueAt, 80)) return res.status(400).json({ error: 'Follow-up action and due date are required.' });
  const result = db.prepare('INSERT INTO follow_ups (request_id, owner_id, action, due_at, note) VALUES (?, ?, ?, ?, ?)')
    .run(row.id, req.operator.sub, text(input.action, 200), text(input.dueAt, 80), text(input.note));
  res.status(201).json({ followUp: db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(result.lastInsertRowid) });
});

router.patch('/follow-ups/:id', requireOperator, (req, res) => {
  return shelved(res, 'Follow-up queue');
  /* istanbul ignore next -- preserved for future reactivation */
  const status = ['Open', 'Completed', 'Cancelled'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Unknown follow-up status.' });
  db.prepare("UPDATE follow_ups SET status = ?, completed_at = CASE WHEN ? = 'Completed' THEN datetime('now') ELSE completed_at END WHERE id = ?").run(status, status, req.params.id);
  res.json({ followUp: db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(req.params.id) });
});

router.post('/requests/:reference/schedule', requireOperator, (req, res) => {
  return shelved(res, 'Scheduling');
  /* istanbul ignore next -- preserved for future reactivation */
  const row = requestFor(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  const input = req.body || {};
  const acceptedQuote = db.prepare("SELECT id FROM quotes WHERE request_id = ? AND status = 'Accepted'").get(row.id);
  if (!acceptedQuote) return res.status(409).json({ error: 'Accept a quote before scheduling the work.' });
  let job = db.prepare('SELECT * FROM jobs WHERE request_id = ?').get(row.id);
  if (!job) {
    const result = db.prepare('INSERT INTO jobs (request_id, quote_id, assigned_to) VALUES (?, ?, ?)').run(row.id, acceptedQuote.id, text(input.assignedTo, 160));
    job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);
  }
  const appointment = db.prepare('SELECT * FROM appointments WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(job.id);
  if (appointment) {
    db.prepare("UPDATE appointments SET requested_window = ?, confirmed_window = ?, status = ?, access_confirmed = ?, notes = ? WHERE id = ?")
      .run(text(input.requestedWindow || row.timing), text(input.confirmedWindow), text(input.status, 30) || 'Requested', input.accessConfirmed ? 1 : 0, text(input.notes), appointment.id);
  } else {
    db.prepare('INSERT INTO appointments (job_id, requested_window, confirmed_window, status, access_confirmed, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(job.id, text(input.requestedWindow || row.timing), text(input.confirmedWindow), text(input.status, 30) || 'Requested', input.accessConfirmed ? 1 : 0, text(input.notes));
  }
  const nextStatus = input.status === 'Confirmed' ? 'Scheduled' : 'Scheduling';
  db.prepare("UPDATE jobs SET status = ?, assigned_to = ?, confirmed_at = CASE WHEN ? = 'Confirmed' THEN datetime('now') ELSE confirmed_at END, updated_at = datetime('now') WHERE id = ?")
    .run(nextStatus === 'Scheduled' ? 'Scheduled' : 'Pending scheduling', text(input.assignedTo, 160), input.status, job.id);
  db.prepare("UPDATE requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(nextStatus, row.id);
  recordEvent.run(row.id, req.operator.sub, row.status, nextStatus, 'schedule', 'internal', text(input.notes || input.confirmedWindow));
  res.status(201).json({ job: jobFor(row.reference) });
});

router.post('/requests/:reference/handoff', requireOperator, (req, res) => {
  return shelved(res, 'Field handoff');
  /* istan ignore next -- preserved for future reactivation */
  const row = requestFor(req.params.reference);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  const job = jobFor(row.reference);
  if (!job) return res.status(409).json({ error: 'Schedule the work before creating a handoff.' });
  const input = req.body || {};
  const existing = db.prepare('SELECT id FROM handoffs WHERE job_id = ?').get(job.id);
  if (existing) db.prepare("UPDATE handoffs SET accepted_scope = ?, exclusions = ?, access_notes = ?, customer_expectations = ?, checklist = ?, assigned_team = ?, updated_at = datetime('now') WHERE job_id = ?").run(text(input.acceptedScope || row.scope), text(input.exclusions), text(input.accessNotes || row.access_notes), text(input.customerExpectations || row.customer_expectations), JSON.stringify(input.checklist || []), text(input.assignedTeam), job.id);
  else db.prepare('INSERT INTO handoffs (job_id, accepted_scope, exclusions, access_notes, customer_expectations, checklist, assigned_team) VALUES (?, ?, ?, ?, ?, ?, ?)').run(job.id, text(input.acceptedScope || row.scope), text(input.exclusions), text(input.accessNotes || row.access_notes), text(input.customerExpectations || row.customer_expectations), JSON.stringify(input.checklist || []), text(input.assignedTeam));
  res.status(201).json({ handoff: db.prepare('SELECT * FROM handoffs WHERE job_id = ?').get(job.id) });
});

router.post('/requests/:reference/variances', requireOperator, (req, res) => {
  return shelved(res, 'Scope variance');
  /* istanbul ignore next -- preserved for future reactivation */
  const row = requestFor(req.params.reference);
  const job = row && jobFor(row.reference);
  if (!job) return res.status(409).json({ error: 'Schedule the work before recording a variance.' });
  const input = req.body || {};
  if (!text(input.issue, 1000)) return res.status(400).json({ error: 'Describe the scope variance.' });
  const result = db.prepare('INSERT INTO scope_variances (job_id, issue, evidence, price_delta, time_delta) VALUES (?, ?, ?, ?, ?)').run(job.id, text(input.issue), text(input.evidence), Number(input.priceDelta) || 0, Number(input.timeDelta) || 0);
  db.prepare("UPDATE requests SET status = 'Needs Approval', updated_at = datetime('now') WHERE id = ?").run(row.id);
  recordEvent.run(row.id, req.operator.sub, row.status, 'Needs Approval', 'variance', 'internal', text(input.issue));
  res.status(201).json({ variance: db.prepare('SELECT * FROM scope_variances WHERE id = ?').get(result.lastInsertRowid) });
});

router.patch('/variances/:id', requireOperator, (req, res) => {
  return shelved(res, 'Scope variance');
  /* istanbul ignore next -- preserved for future reactivation */
  const decision = ['Approved', 'Declined'].includes(req.body?.decision) ? req.body.decision : null;
  if (!decision) return res.status(400).json({ error: 'Decision must be Approved or Declined.' });
  db.prepare("UPDATE scope_variances SET status = ?, customer_decision = ?, decided_at = datetime('now') WHERE id = ?").run(decision, decision, req.params.id);
  res.json({ variance: db.prepare('SELECT * FROM scope_variances WHERE id = ?').get(req.params.id) });
});

router.post('/requests/:reference/quality', requireOperator, (req, res) => {
  return shelved(res, 'Quality review');
  /* istanbul ignore next -- preserved for future reactivation */
  const row = requestFor(req.params.reference);
  const job = row && jobFor(row.reference);
  if (!job) return res.status(409).json({ error: 'Schedule the work before quality review.' });
  const input = req.body || {};
  const quality = db.prepare('SELECT id FROM quality_reviews WHERE job_id = ?').get(job.id);
  if (quality) db.prepare('UPDATE quality_reviews SET checklist = ?, issues = ?, evidence = ?, result = ?, reviewed_at = datetime(\'now\'), reviewed_by = ? WHERE job_id = ?').run(JSON.stringify(input.checklist || []), text(input.issues), JSON.stringify(input.evidence || []), text(input.result, 30) || 'Pending', req.operator.sub, job.id);
  else db.prepare('INSERT INTO quality_reviews (job_id, checklist, issues, evidence, result, reviewed_at, reviewed_by) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), ?)').run(job.id, JSON.stringify(input.checklist || []), text(input.issues), JSON.stringify(input.evidence || []), text(input.result, 30) || 'Pending', req.operator.sub);
  const next = input.result === 'Pass' ? 'Quality Check' : 'Needs Approval';
  db.prepare("UPDATE requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, row.id);
  res.status(201).json({ quality: db.prepare('SELECT * FROM quality_reviews WHERE job_id = ?').get(job.id) });
});

router.post('/requests/:reference/complete', requireOperator, (req, res) => {
  return shelved(res, 'Job completion');
  /* istanbul ignore next -- preserved for future reactivation */
  const row = requestFor(req.params.reference);
  const job = row && jobFor(row.reference);
  if (!job) return res.status(409).json({ error: 'Schedule the work before completing it.' });
  const input = req.body || {};
  if (input.customerSignoff === 'Required' || input.customerSignoff === 'Pending') return res.status(400).json({ error: 'Record customer sign-off before completion.' });
  const existing = db.prepare('SELECT id FROM completion_records WHERE job_id = ?').get(job.id);
  const values = [input.customerSignoff || 'Recorded', text(input.actualNotes), JSON.stringify(input.evidence || []), input.repeatRecommended ? 1 : 0, text(input.nextRecommendedDate, 40), text(input.issueFollowup)];
  if (existing) db.prepare("UPDATE completion_records SET completed_at = datetime('now'), customer_signoff = ?, actual_notes = ?, evidence = ?, repeat_recommended = ?, next_recommended_date = ?, issue_followup = ? WHERE job_id = ?").run(...values, job.id);
  else db.prepare("INSERT INTO completion_records (job_id, completed_at, customer_signoff, actual_notes, evidence, repeat_recommended, next_recommended_date, issue_followup) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)").run(job.id, ...values);
  db.prepare("UPDATE jobs SET status = 'Completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(job.id);
  db.prepare("UPDATE requests SET status = 'Completed', updated_at = datetime('now') WHERE id = ?").run(row.id);
  recordEvent.run(row.id, req.operator.sub, row.status, 'Completed', 'completion', 'internal', text(input.actualNotes));
  res.status(201).json({ completion: db.prepare('SELECT * FROM completion_records WHERE job_id = ?').get(job.id) });
});

module.exports = router;
