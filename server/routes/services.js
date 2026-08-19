'use strict';

const express = require('express');
const { requireOperator } = require('../auth');
const { db, getOperatorServices, getService } = require('../catalog');

const router = express.Router();
router.use(requireOperator);

const jsonFields = new Set(['propertyTypes', 'customerTypes', 'frequencyOptions', 'addOnRules']);
const fields = {
  name: 'name', category: 'category', description: 'description', buyers: 'buyers', color: 'color', icon: 'card_icon', featuredOrder: 'featured_order', sizeUnit: 'size_unit',
  propertyTypes: 'property_types', customerTypes: 'customer_types', frequencyOptions: 'frequency_options', useCases: 'use_cases',
  includedScope: 'included_scope', exclusions: 'exclusions', tags: 'tags', timingPattern: 'timing_pattern', preferredLeadTime: 'preferred_lead_time',
  estimatedDuration: 'estimated_duration', repeatPotential: 'repeat_potential', customerNote: 'customer_note', featured: 'featured',
  pricingReadiness: 'pricing_readiness', pricingBasis: 'pricing_basis', pricingModel: 'pricing_model', sizeInputLabel: 'size_input_label',
  basePrice: 'base_price', estimateSpread: 'estimate_spread', unitRate: 'unit_rate', minimumPrice: 'minimum_price',
  standardMultiplier: 'standard_multiplier', heavyMultiplier: 'heavy_multiplier', extremeMultiplier: 'extreme_multiplier',
  oneTimeMultiplier: 'one_time_multiplier', recurringMultiplier: 'recurring_multiplier', rushMultiplier: 'rush_multiplier',
  travelFeeType: 'travel_fee_type', travelFeeAmount: 'travel_fee_amount', serviceAreaRule: 'service_area_rule', addOnRules: 'add_on_rules',
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

function hasPricing(service) {
  return service.pricingReadiness === 'Ready'
    && [service.basePrice, service.unitRate, service.minimumPrice, service.estimateSpread,
      service.standardMultiplier, service.heavyMultiplier, service.extremeMultiplier,
      service.oneTimeMultiplier, service.recurringMultiplier].every(Number.isFinite)
    && service.addOnRules.every((addOn) => Number.isFinite(Number(addOn.price)));
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

router.post('/ops/services', (req, res) => {
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(input.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = String(input.name || '').trim();
  if (!id || !name) return res.status(400).json({ error: 'Service ID and name are required.' });
  if (getService(id)) return res.status(409).json({ error: 'A service with that ID already exists.' });

  db.prepare(`INSERT INTO services (id, name, description, status, pricing_readiness, change_reason) VALUES (?, ?, ?, 'Draft', 'Needs operator pricing review', ?)`)
    .run(id, name, String(input.description || ''), 'Created as a draft.');
  const service = getService(id);
  recordEvent(service, req.operator.sub, 'created');
  res.status(201).json({ service });
});

router.patch('/ops/services/:id', (req, res) => {
  const current = getService(req.params.id);
  if (!current) return res.status(404).json({ error: 'Service not found.' });
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const raw = selectRaw.get(req.params.id);
  const nextVersion = `v${Number(String(current.version || 'v1.0').replace(/^v/, '').split('.')[0]) + 1}.0`;

  if (raw.status === 'Published') {
    const candidate = { ...current, ...input, version: nextVersion, status: 'Draft' };
    db.prepare("UPDATE services SET draft_snapshot = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(candidate), current.id);
    recordEvent(candidate, req.operator.sub, 'saved-draft');
    return res.json({ service: candidate });
  }

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
  recordEvent(updated, req.operator.sub, 'saved-draft');
  res.json({ service: updated });
});

router.post('/ops/services/:id/publish', (req, res) => {
  const service = getService(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  if (!hasPricing(service)) return res.status(409).json({ error: 'Complete pricing inputs and mark the service Ready before publishing.' });
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
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'Enter a sample size greater than zero.' });
  const condition = ['Standard', 'Heavy', 'Extreme'].includes(input.condition) ? input.condition : 'Standard';
  const recurring = input.frequency === 'Recurring' ? Number(service.recurringMultiplier) || 1 : 1;
  const addOns = Array.isArray(input.addOns) ? input.addOns : [];
  const addOnTotal = addOns.reduce((total, name) => {
    const match = service.addOnRules.find((item) => item.name === name);
    return total + (match ? Number(match.price) || 0 : 0);
  }, 0);
  const local = String(input.location || '').match(/\b554\d{2}\b/);
  const travel = local ? 0 : Number(service.travelFeeAmount) || 0;
  const total = Math.max(
    Number(service.minimumPrice) || 0,
    ((Number(service.basePrice) || 0) + size * (Number(service.unitRate) || 0))
      * (Number(service[`${condition.toLowerCase()}Multiplier`]) || 1) * recurring + addOnTotal + travel,
  );
  const spread = Number(service.estimateSpread) || 0;
  res.json({ estimate: {
    low: Math.round(total * (1 - spread)),
    high: Math.round(total * (1 + spread)),
    breakdown: [
      `${service.basePrice || 0} base service`,
      `${size * (Number(service.unitRate) || 0)} size allowance`,
      `${condition} condition`,
      addOnTotal ? `${addOnTotal} selected add-ons` : 'No add-ons',
      travel ? `${travel} travel allowance` : 'Local service area',
      input.frequency === 'Recurring' ? 'Recurring-service adjustment' : 'One-time service',
    ],
  } });
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
