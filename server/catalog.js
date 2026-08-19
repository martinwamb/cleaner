'use strict';

const db = require('./db');

const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const rowToService = (row, includeDraft = false) => {
  const service = {
  id: row.id,
  name: row.name,
  category: row.category,
  status: row.status,
  description: row.description,
  buyers: row.buyers,
  color: row.color,
  icon: row.card_icon,
  featuredOrder: row.featured_order,
  sizeUnit: row.size_unit,
  propertyTypes: parseJson(row.property_types, []),
  customerTypes: parseJson(row.customer_types, []),
  frequencyOptions: parseJson(row.frequency_options, []),
  useCases: row.use_cases,
  includedScope: row.included_scope,
  exclusions: row.exclusions,
  tags: row.tags,
  timingPattern: row.timing_pattern,
  preferredLeadTime: row.preferred_lead_time,
  estimatedDuration: row.estimated_duration,
  repeatPotential: row.repeat_potential,
  customerNote: row.customer_note,
  featured: Boolean(row.featured),
  pricingReadiness: row.pricing_readiness,
  pricingBasis: row.pricing_basis,
  pricingModel: row.pricing_model,
  sizeInputLabel: row.size_input_label,
  basePrice: row.base_price,
  estimateSpread: row.estimate_spread,
  unitRate: row.unit_rate,
  minimumPrice: row.minimum_price,
  standardMultiplier: row.standard_multiplier,
  heavyMultiplier: row.heavy_multiplier,
  extremeMultiplier: row.extreme_multiplier,
  oneTimeMultiplier: row.one_time_multiplier,
  recurringMultiplier: row.recurring_multiplier,
  rushMultiplier: row.rush_multiplier,
  travelFeeType: row.travel_fee_type,
  travelFeeAmount: row.travel_fee_amount,
  serviceAreaRule: row.service_area_rule,
  addOnRules: parseJson(row.add_on_rules, []),
  version: row.version,
  effectiveDate: row.effective_date,
  changeReason: row.change_reason,
  updatedAt: row.updated_at,
  };
  if (includeDraft && row.draft_snapshot) {
    try { return { ...service, ...JSON.parse(row.draft_snapshot), status: 'Draft' }; } catch { /* ignore malformed draft */ }
  }
  return service;
};

const selectAll = db.prepare('SELECT * FROM services ORDER BY name COLLATE NOCASE');
const selectPublished = db.prepare("SELECT * FROM services WHERE status = 'Published' ORDER BY name COLLATE NOCASE");
const selectById = db.prepare('SELECT * FROM services WHERE id = ?');

function getService(id) {
  const row = selectById.get(id);
  return row ? rowToService(row, true) : null;
}

function getOperatorServices() {
  return selectAll.all().map((row) => rowToService(row, true));
}

function getPublishedServices() {
  return selectPublished.all().map((row) => rowToService(row));
}

function getPublicCatalog() {
  const services = getPublishedServices();
  const addOns = new Map();
  for (const service of services) {
    for (const addOn of service.addOnRules) addOns.set(addOn.name, addOn);
  }
  return {
    services,
    propertyTypes: [...new Set(services.flatMap((service) => service.propertyTypes))].sort(),
    conditions: ['Standard', 'Heavy', 'Extreme'],
    frequencies: ['One-time', 'Recurring'],
    addOns: [...addOns.values()],
  };
}

function getPricing(serviceName) {
  const row = db.prepare('SELECT * FROM services WHERE status = \'Published\' AND (name = ? OR id = ?)').get(serviceName, serviceName);
  if (!row) return null;
  const service = rowToService(row);
  return {
    service,
    base: service.basePrice,
    sizeRate: service.unitRate,
    minimum: service.minimumPrice,
    spread: service.estimateSpread,
    condition: {
      Standard: service.standardMultiplier,
      Heavy: service.heavyMultiplier,
      Extreme: service.extremeMultiplier,
    },
    recurring: service.recurringMultiplier,
    travelFee: service.travelFeeAmount || 0,
    addOns: service.addOnRules,
  };
}

module.exports = {
  db,
  getService,
  getOperatorServices,
  getPublishedServices,
  getPublicCatalog,
  getPricing,
  rowToService,
};
