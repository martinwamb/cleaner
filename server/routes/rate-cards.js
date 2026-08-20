'use strict';

const express = require('express');
const { requireOperator } = require('../auth');
const { db, getOperatorRateCards, getService, rowToService } = require('../catalog');

const router = express.Router();
router.use(requireOperator);

const jsonFields = new Set(['postalCodes', 'addOnRules']);
const fields = {
  name: 'name', locationName: 'location_name', postalCodes: 'postal_codes', pricingModel: 'pricing_model',
  sizeInputLabel: 'size_input_label', basePrice: 'base_price', unitRate: 'unit_rate', minimumPrice: 'minimum_price',
  estimateSpread: 'estimate_spread', standardMultiplier: 'standard_multiplier', heavyMultiplier: 'heavy_multiplier',
  extremeMultiplier: 'extreme_multiplier', oneTimeMultiplier: 'one_time_multiplier', recurringMultiplier: 'recurring_multiplier',
  travelFeeAmount: 'travel_fee_amount', addOnRules: 'add_on_rules', effectiveDate: 'effective_date', changeReason: 'change_reason',
};

const selectRaw = db.prepare('SELECT * FROM rate_cards WHERE id = ?');
const selectServiceRaw = db.prepare('SELECT * FROM services WHERE id = ?');

const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

const toCard = (row) => ({
  id: row.id,
  serviceId: row.service_id,
  serviceName: row.service_name || selectServiceRaw.get(row.service_id)?.name || '',
  serviceCategory: row.service_category || selectServiceRaw.get(row.service_id)?.category || '',
  name: row.name,
  status: row.status,
  locationName: row.location_name,
  postalCodes: parseJson(row.postal_codes, []),
  pricingModel: row.pricing_model,
  sizeInputLabel: row.size_input_label,
  basePrice: row.base_price,
  unitRate: row.unit_rate,
  minimumPrice: row.minimum_price,
  estimateSpread: row.estimate_spread,
  standardMultiplier: row.standard_multiplier,
  heavyMultiplier: row.heavy_multiplier,
  extremeMultiplier: row.extreme_multiplier,
  oneTimeMultiplier: row.one_time_multiplier,
  recurringMultiplier: row.recurring_multiplier,
  travelFeeAmount: row.travel_fee_amount,
  addOnRules: parseJson(row.add_on_rules, []),
  version: row.version,
  effectiveDate: row.effective_date,
  changeReason: row.change_reason,
  updatedAt: row.updated_at,
});

const serialize = (field, value) => jsonFields.has(field) ? JSON.stringify(value || []) : value === '' ? null : value;
const nextVersion = (version) => `v${Number(String(version || 'v1.0').replace(/^v/, '').split('.')[0]) + 1}.0`;

function recordEvent(card, operatorId, action) {
  db.prepare(`
    INSERT INTO rate_card_change_events (rate_card_id, operator_id, action, version, change_reason, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(card.id, operatorId, action, card.version, card.changeReason || '', JSON.stringify(card));
}

function getCard(id) {
  const row = selectRaw.get(id);
  return row ? toCard(row) : null;
}

function hasPricing(card) {
  if (card.pricingModel === 'Custom quote') return true;
  return [card.basePrice, card.minimumPrice, card.estimateSpread, card.standardMultiplier,
    card.heavyMultiplier, card.extremeMultiplier, card.oneTimeMultiplier, card.recurringMultiplier]
    .every(Number.isFinite) && (card.pricingModel === 'Flat range' || Number.isFinite(card.unitRate));
}

function pricingValidation(card) {
  const errors = [];
  const amounts = [['basePrice', card.basePrice], ['unitRate', card.unitRate], ['minimumPrice', card.minimumPrice], ['travelFeeAmount', card.travelFeeAmount]];
  for (const [name, value] of amounts) if (value != null && (!Number.isFinite(value) || value < 0)) errors.push(`${name} must be zero or greater.`);
  if (card.estimateSpread != null && (!Number.isFinite(card.estimateSpread) || card.estimateSpread < 0 || card.estimateSpread > 1)) errors.push('estimateSpread must be between 0 and 1.');
  for (const [name, value] of [['standardMultiplier', card.standardMultiplier], ['heavyMultiplier', card.heavyMultiplier], ['extremeMultiplier', card.extremeMultiplier], ['oneTimeMultiplier', card.oneTimeMultiplier], ['recurringMultiplier', card.recurringMultiplier]]) {
    if (value != null && (!Number.isFinite(value) || value <= 0)) errors.push(`${name} must be greater than zero.`);
  }
  if (card.pricingModel !== 'Custom quote' && !hasPricing(card)) errors.push('Complete the required pricing inputs for this pricing method.');
  return errors;
}

function calculateCardEstimate(card, input) {
  if (card.pricingModel === 'Custom quote') return null;
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) throw new Error('Enter a sample size greater than zero.');
  const condition = ['Standard', 'Heavy', 'Extreme'].includes(input.condition) ? input.condition : 'Standard';
  const multiplier = Number(card[`${condition.charAt(0).toLowerCase()}${condition.slice(1)}Multiplier`]) || 1;
  const recurring = input.frequency === 'Recurring' ? Number(card.recurringMultiplier) || 1 : 1;
  const addOns = Array.isArray(input.addOns) ? input.addOns : [];
  const addOnTotal = addOns.reduce((total, name) => total + (card.addOnRules.find((item) => item.name === name)?.price || 0), 0);
  const postalCode = String(input.location || '').match(/\b\d{5}\b/)?.[0];
  const local = card.postalCodes.length === 0 || card.postalCodes.includes(postalCode);
  const travel = local ? 0 : Number(card.travelFeeAmount) || 0;
  const sizeAllowance = card.pricingModel === 'Flat range' ? 0 : size * (Number(card.unitRate) || 0);
  const total = Math.max(Number(card.minimumPrice) || 0, ((Number(card.basePrice) || 0) + sizeAllowance) * multiplier * recurring + addOnTotal + travel);
  const spread = Number(card.estimateSpread) || 0;
  return {
    low: Math.round(total * (1 - spread)),
    high: Math.round(total * (1 + spread)),
    breakdown: [
      `$${Math.round(Number(card.basePrice) || 0).toLocaleString()} base service`,
      `$${Math.round(sizeAllowance).toLocaleString()} size allowance`,
      `${condition} condition`,
      addOnTotal ? `$${Math.round(addOnTotal).toLocaleString()} selected add-ons` : 'No add-ons',
      travel ? `$${Math.round(travel).toLocaleString()} travel allowance` : 'Local service area',
      input.frequency === 'Recurring' ? 'Recurring-service adjustment' : 'One-time service',
    ],
  };
}

router.get('/ops/rate-cards', (req, res) => res.json({ rateCards: getOperatorRateCards() }));

router.post('/ops/rate-cards', (req, res) => {
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const serviceId = String(input.serviceId || '').trim();
  const service = getService(serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  const name = String(input.name || `${service.name} rate`).trim();
  db.prepare(`
    INSERT INTO rate_cards (service_id, name, location_name, postal_codes, pricing_model, size_input_label, change_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(serviceId, name, String(input.locationName || 'Default service area'), JSON.stringify(input.postalCodes || []), input.pricingModel || 'Custom quote', input.sizeInputLabel || service.sizeUnit, 'Created as a draft rate card.');
  const card = getCard(db.prepare('SELECT last_insert_rowid() AS id').get().id);
  recordEvent(card, req.operator.sub, 'created');
  res.status(201).json({ rateCard: card });
});

router.post('/ops/rate-cards/:id/duplicate', (req, res) => {
  const current = getCard(req.params.id);
  if (!current) return res.status(404).json({ error: 'Rate card not found.' });
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  db.prepare(`
    INSERT INTO rate_cards (
      service_id, name, status, location_name, postal_codes, pricing_model, size_input_label,
      base_price, unit_rate, minimum_price, estimate_spread, standard_multiplier,
      heavy_multiplier, extreme_multiplier, one_time_multiplier, recurring_multiplier,
      travel_fee_amount, add_on_rules, version, change_reason
    ) VALUES (?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(current.serviceId, input.name || `${current.name} draft`, current.locationName, JSON.stringify(current.postalCodes), current.pricingModel, current.sizeInputLabel, current.basePrice, current.unitRate, current.minimumPrice, current.estimateSpread, current.standardMultiplier, current.heavyMultiplier, current.extremeMultiplier, current.oneTimeMultiplier, current.recurringMultiplier, current.travelFeeAmount, JSON.stringify(current.addOnRules), nextVersion(current.version), 'Drafted from an existing rate card.');
  const card = getCard(db.prepare('SELECT last_insert_rowid() AS id').get().id);
  recordEvent(card, req.operator.sub, 'duplicated');
  res.status(201).json({ rateCard: card });
});

router.patch('/ops/rate-cards/:id', (req, res) => {
  const current = getCard(req.params.id);
  if (!current) return res.status(404).json({ error: 'Rate card not found.' });
  if (current.status === 'Published') return res.status(409).json({ error: 'Published rate cards are locked. Duplicate it to create a new draft.' });
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const candidate = { ...current, ...input };
  const validation = pricingValidation(candidate);
  if (validation.length) return res.status(400).json({ error: 'Check the pricing inputs.', errors: validation });
  const updates = [];
  const values = [];
  for (const [field, column] of Object.entries(fields)) {
    if (input[field] === undefined) continue;
    updates.push(`${column} = ?`);
    values.push(serialize(field, input[field]));
  }
  if (!updates.length) return res.json({ rateCard: current });
  updates.push('version = ?', "updated_at = datetime('now')");
  values.push(nextVersion(current.version), current.id);
  db.prepare(`UPDATE rate_cards SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const card = getCard(current.id);
  recordEvent(card, req.operator.sub, 'saved-draft');
  res.json({ rateCard: card });
});

router.post('/ops/rate-cards/:id/preview', (req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Rate card not found.' });
  try { return res.json({ estimate: calculateCardEstimate(card, req.body || {}) }); } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post('/ops/rate-cards/:id/publish', (req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Rate card not found.' });
  if (!hasPricing(card)) return res.status(409).json({ error: 'Complete the rate card inputs before publishing.' });
  const publish = db.transaction(() => {
    db.prepare("UPDATE rate_cards SET status = 'Archived', updated_at = datetime('now') WHERE service_id = ? AND location_name = ? AND status = 'Published'").run(card.serviceId, card.locationName);
    db.prepare("UPDATE rate_cards SET status = 'Published', effective_date = COALESCE(effective_date, date('now')), updated_at = datetime('now') WHERE id = ?").run(card.id);
    const service = selectServiceRaw.get(card.serviceId);
    db.prepare(`
       UPDATE services SET pricing_readiness = 'Ready', pricing_model = ?, size_input_label = ?,
        base_price = ?, unit_rate = ?, minimum_price = ?, estimate_spread = ?, standard_multiplier = ?,
        heavy_multiplier = ?, extreme_multiplier = ?, one_time_multiplier = ?, recurring_multiplier = ?,
        travel_fee_amount = ?, add_on_rules = ?, effective_date = date('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(card.pricingModel, card.sizeInputLabel, card.basePrice, card.unitRate, card.minimumPrice, card.estimateSpread, card.standardMultiplier, card.heavyMultiplier, card.extremeMultiplier, card.oneTimeMultiplier, card.recurringMultiplier, card.travelFeeAmount, JSON.stringify(card.addOnRules), card.serviceId);
    return getCard(card.id);
  });
  const published = publish();
  recordEvent(published, req.operator.sub, 'published');
  res.json({ rateCard: published });
});

router.post('/ops/rate-cards/:id/archive', (req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Rate card not found.' });
  const archive = db.transaction(() => {
    db.prepare("UPDATE rate_cards SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(card.id);
    const remaining = db.prepare("SELECT COUNT(*) AS count FROM rate_cards WHERE service_id = ? AND status = 'Published'").get(card.serviceId).count;
    if (!remaining) db.prepare("UPDATE services SET status = 'Paused', updated_at = datetime('now') WHERE id = ?").run(card.serviceId);
  });
  archive();
  const archived = getCard(card.id);
  recordEvent(archived, req.operator.sub, 'archived');
  res.json({ rateCard: archived });
});

module.exports = router;
