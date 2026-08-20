'use strict';

const express = require('express');
const { requireOperator } = require('../auth');
const { db, getOperatorServices, getService } = require('../catalog');
const { calculateEstimate } = require('../pricing');

const router = express.Router();
router.use(requireOperator);

const jsonFields = new Set(['propertyTypes', 'customerTypes', 'frequencyOptions', 'addOnRules']);
const fields = {
  name: 'name', category: 'category', description: 'description', buyers: 'buyers', color: 'color', icon: 'card_icon', featuredOrder: 'featured_order', sizeUnit: 'size_unit',
  propertyTypes: 'property_types', customerTypes: 'customer_types', frequencyOptions: 'frequency_options', useCases: 'use_cases',
  includedScope: 'included_scope', exclusions: 'exclusions', tags: 'tags', timingPattern: 'timing_pattern', preferredLeadTime: 'preferred_lead_time',
  estimatedDuration: 'estimated_duration', repeatPotential: 'repeat_potential', customerNote: 'customer_note', featured: 'featured',
  version: 'version', effectiveDate: 'effective_date', changeReason: 'change_reason',
};
const selectRaw = db.prepare('SELECT * FROM services WHERE id = ?');

function serialize(field, value) {
  if (jsonFields.has(field)) return JSON.stringify(value || []);
  if (field === 'featured') return value ? 1 : 0;
  return value === '' ? null : value;
}

function snapshot(service) {
  return JSON.stringify(service);
}

function recordEvent(service, operatorId, action) {
  db.prepare(`
    INSERT INTO service_change_events (service_id, operator_id, action, version, change_reason, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(service.id, operatorId, action, service.version, service.changeReason || '', snapshot(service));
}

function applyServiceFields(service, id) {
  const updates = [];
  const values = [];
  for (const [field, column] of Object.entries(fields)) {
    if (field === 'version' || service[field] === undefined) continue;
    updates.push(`${column} = ?`);
    values.push(serialize(field, service[field]));
  }
  updates.push('version = ?', "updated_at = datetime('now')");
  values.push(service.version, id);
  db.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

router.get('/ops/services', (req, res) => {
  res.json({ services: getOperatorServices() });
});

router.get('/ops/services/:id', (req, res) => {
  const service = getService(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  res.json({ service });
});

router.post('/ops/service-offerings', (req, res) => {
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const serviceInput = input.service && typeof input.service === 'object' ? input.service : input;
  const id = String(serviceInput.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = String(serviceInput.name || '').trim();
  const cards = Array.isArray(input.rateCards) ? input.rateCards : [];
  const required = [
    ['description', serviceInput.description], ['category', serviceInput.category], ['includedScope', serviceInput.includedScope],
    ['exclusions', serviceInput.exclusions], ['customerNote', serviceInput.customerNote], ['timingPattern', serviceInput.timingPattern],
  ].filter(([, value]) => !String(value || '').trim()).map(([field]) => field);
  if (!id || !name) return res.status(400).json({ error: 'Service ID and name are required.' });
  if (getService(id)) return res.status(409).json({ error: 'A service with that ID already exists.' });
  if (required.length) return res.status(400).json({ error: 'Complete the customer-facing service details before saving.', fields: required });
  if (!cards.length) return res.status(400).json({ error: 'Add at least one rate card before saving this service.' });

  const createOffering = db.transaction(() => {
    db.prepare(`INSERT INTO services (id, name, category, description, buyers, color, card_icon, property_types, customer_types, frequency_options, use_cases, included_scope, exclusions, tags, timing_pattern, preferred_lead_time, estimated_duration, repeat_potential, customer_note, featured, status, pricing_readiness, change_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Published', 'Ready', ?)`)
      .run(id, name, String(serviceInput.category || ''), String(serviceInput.description || ''), String(serviceInput.buyers || ''), String(serviceInput.color || 'clay'), String(serviceInput.icon || '▦'), JSON.stringify(serviceInput.propertyTypes || []), JSON.stringify(serviceInput.customerTypes || []), JSON.stringify(serviceInput.frequencyOptions || ['One-time', 'Recurring']), String(serviceInput.useCases || ''), String(serviceInput.includedScope || ''), String(serviceInput.exclusions || ''), String(serviceInput.tags || ''), String(serviceInput.timingPattern || ''), String(serviceInput.preferredLeadTime || ''), String(serviceInput.estimatedDuration || ''), String(serviceInput.repeatPotential || ''), String(serviceInput.customerNote || ''), serviceInput.featured ? 1 : 0, 'Created with connected rate cards.');
    const insertCard = db.prepare(`INSERT INTO rate_cards (service_id, name, status, location_name, postal_codes, pricing_model, size_input_label, base_price, unit_rate, minimum_price, estimate_spread, standard_multiplier, heavy_multiplier, extreme_multiplier, one_time_multiplier, recurring_multiplier, travel_fee_amount, add_on_rules, change_reason) VALUES (?, ?, 'Published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const card of cards) {
      const pricingModel = String(card.pricingModel || 'Custom quote');
      if (pricingModel !== 'Custom quote' && !Number.isFinite(Number(card.basePrice))) throw new Error('Each non-custom rate card needs a base price.');
      insertCard.run(id, String(card.name || `${name} rate`), String(card.locationName || 'Default service area'), JSON.stringify(Array.isArray(card.postalCodes) ? card.postalCodes : []), pricingModel, String(card.sizeInputLabel || serviceInput.sizeUnit || 'Units or project scope'), card.basePrice == null ? null : Number(card.basePrice), card.unitRate == null ? null : Number(card.unitRate), card.minimumPrice == null ? null : Number(card.minimumPrice), card.estimateSpread == null ? 0 : Number(card.estimateSpread), card.standardMultiplier == null ? 1 : Number(card.standardMultiplier), card.heavyMultiplier == null ? 1 : Number(card.heavyMultiplier), card.extremeMultiplier == null ? 1 : Number(card.extremeMultiplier), card.oneTimeMultiplier == null ? 1 : Number(card.oneTimeMultiplier), card.recurringMultiplier == null ? 1 : Number(card.recurringMultiplier), card.travelFeeAmount == null ? 0 : Number(card.travelFeeAmount), JSON.stringify(Array.isArray(card.addOnRules) ? card.addOnRules : []), 'Created with service offering.');
    }
    return getService(id);
  });

  try {
    const service = createOffering();
    recordEvent(service, req.operator.sub, 'created-and-published');
    res.status(201).json({ service });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.patch('/ops/services/:id', (req, res) => {
  const current = getService(req.params.id);
  if (!current) return res.status(404).json({ error: 'Service not found.' });
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const nextVersion = `v${Number(String(current.version || 'v1.0').replace(/^v/, '').split('.')[0]) + 1}.0`;

  const updates = [];
  const values = [];
  for (const [field, column] of Object.entries(fields)) {
    if (input[field] === undefined || field === 'version') continue;
    updates.push(`${column} = ?`);
    values.push(serialize(field, input[field]));
  }
  if (!updates.length) return res.json({ service: current });
  updates.push("version = ?", "updated_at = datetime('now')");
  values.push(nextVersion, current.id);
  db.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = getService(current.id);
  recordEvent(updated, req.operator.sub, 'updated');
  res.json({ service: updated });
});

router.post('/ops/services/:id/publish', (req, res) => {
  const service = getService(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  const publishedRate = db.prepare("SELECT 1 FROM rate_cards WHERE service_id = ? AND status = 'Published' LIMIT 1").get(service.id);
  if (!publishedRate) return res.status(409).json({ error: 'Publish a Rate Card before publishing this service.' });
  const readiness = [
    !service.name || !service.description ? 'Add a customer-facing service name and description.' : '',
    !service.includedScope ? 'Define the included scope.' : '',
    !service.exclusions ? 'Define exclusions and assumptions.' : '',
    !service.customerNote ? 'Add customer preparation guidance.' : '',
    !service.propertyTypes.length ? 'Choose at least one eligible property type.' : '',
    !service.timingPattern || !service.estimatedDuration ? 'Define timing and estimated duration.' : '',
  ].filter(Boolean);
  if (readiness.length) return res.status(409).json({ error: 'Complete the service readiness checklist before publishing.', errors: readiness });
  const raw = selectRaw.get(service.id);
  if (raw.status === 'Published' && raw.draft_snapshot) {
    applyServiceFields(service, service.id);
    db.prepare("UPDATE services SET status = 'Published', draft_snapshot = NULL, effective_date = COALESCE(effective_date, date('now')), updated_at = datetime('now') WHERE id = ?").run(service.id);
  } else {
    db.prepare("UPDATE services SET status = 'Published', draft_snapshot = NULL, effective_date = COALESCE(effective_date, date('now')), updated_at = datetime('now') WHERE id = ?").run(service.id);
  }
  const published = getService(service.id);
  recordEvent(published, req.operator.sub, 'published');
  res.json({ service: published });
});

router.post('/ops/services/:id/preview', (req, res) => {
  const service = getService(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const estimate = calculateEstimate({ ...input, serviceId: service.id, service: service.name });
  if (!estimate) return res.status(409).json({ error: 'No published rate card can price this service and sample location.' });
  res.json({ estimate });
});

router.post('/ops/services/:id/pause', (req, res) => {
  const service = getService(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  db.prepare("UPDATE services SET status = 'Paused', draft_snapshot = NULL, updated_at = datetime('now') WHERE id = ?").run(service.id);
  const paused = getService(service.id);
  recordEvent(paused, req.operator.sub, 'paused');
  res.json({ service: paused });
});

module.exports = router;
