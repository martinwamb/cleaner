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
const selectAllRateCards = db.prepare(`
  SELECT rate_cards.*, services.name AS service_name, services.category AS service_category
  FROM rate_cards JOIN services ON services.id = rate_cards.service_id
  ORDER BY services.name COLLATE NOCASE, rate_cards.location_name COLLATE NOCASE
`);
const selectRateCardsByService = db.prepare("SELECT * FROM rate_cards WHERE service_id = ? AND status = 'Published' ORDER BY location_name COLLATE NOCASE");

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

function getPricing(serviceName, location) {
  return getPricingForLocation(serviceName, location);
}

function rowToRateCard(row) {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    serviceCategory: row.service_category,
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
  };
}

function getOperatorRateCards() {
  return selectAllRateCards.all().map(rowToRateCard);
}

function getPricingForLocation(serviceName, location) {
  const row = db.prepare('SELECT * FROM services WHERE status = \'Published\' AND (name = ? OR id = ?)').get(serviceName, serviceName);
  if (!row) return null;
  const service = rowToService(row);
  const postalCode = String(location || '').match(/\b\d{5}\b/)?.[0] || '';
  const cards = selectRateCardsByService.all(service.id);
  const rateCard = cards.find((card) => parseJson(card.postal_codes, []).includes(postalCode))
    || cards.find((card) => parseJson(card.postal_codes, []).length === 0);
  const source = rateCard ? rowToRateCard({ ...rateCard, service_name: service.name, service_category: service.category }) : service;
  return {
    service,
    rateCard: rateCard || null,
    base: source.basePrice,
    sizeRate: source.unitRate,
    minimum: source.minimumPrice,
    spread: source.estimateSpread,
    condition: {
      Standard: source.standardMultiplier,
      Heavy: source.heavyMultiplier,
      Extreme: source.extremeMultiplier,
    },
    recurring: source.recurringMultiplier,
    travelFee: source.travelFeeAmount || 0,
    addOns: source.addOnRules,
  };
}

module.exports = {
  db,
  getService,
  getOperatorServices,
  getPublishedServices,
  getOperatorRateCards,
  getPublicCatalog,
  getPricing,
  getPricingForLocation,
  rowToService,
};
