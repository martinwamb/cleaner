'use strict';

const { getPublicCatalog, getPricing } = require('./catalog');
const snapshot = require('./catalog-config.json');

const LOCAL_POSTAL_CODES = new Set(snapshot.localPostalCodes);
const MAX_SIZE = 1_000_000;
const CONDITIONS = ['Standard', 'Heavy', 'Extreme'];
const FREQUENCIES = ['One-time', 'Recurring'];
const SERVICE_ALIASES = new Map([
  ['Deep cleaning', 'Residential deep cleaning'],
  ['Post-construction cleanup', 'Post-Construction Final Clean'],
  ['Commercial cleaning', 'Recurring Commercial Cleaning'],
]);

const formatCurrency = (amount) => `$${Math.round(amount).toLocaleString('en-US')}`;

const resolveServiceName = (name) => SERVICE_ALIASES.get(name) || name;

function isLocal(location) {
  const match = String(location || '').match(/\b\d{5}\b/);
  return match ? LOCAL_POSTAL_CODES.has(match[0]) : false;
}

function normalizeAddOns(addOns, configuredAddOns) {
  const list = Array.isArray(addOns) ? addOns : addOns ? [addOns] : [];
  const prices = new Map((configuredAddOns || []).map((item) => [item.name, item.price]));
  return list.map((item) => String(item)).filter((item) => prices.has(item));
}

function serviceNames() {
  return [...getPublicCatalog().services.map((service) => service.name), ...SERVICE_ALIASES.keys()];
}

function calculateEstimate({ service, property, size, condition, frequency, addOns, location }) {
  const pricing = getPricing(resolveServiceName(service));
  if (!pricing || !Number.isFinite(Number(pricing.base))) return null;

  const sizeNumber = Number(size);
  if (!Number.isFinite(sizeNumber) || sizeNumber <= 0 || sizeNumber > MAX_SIZE) return null;

  const conditionKey = CONDITIONS.includes(condition) ? condition : 'Standard';
  const frequencyKey = FREQUENCIES.includes(frequency) ? frequency : 'One-time';
  const selectedAddOns = normalizeAddOns(addOns, pricing.addOns);
  const configuredAddOnPrices = new Map(pricing.addOns.map((item) => [item.name, item.price]));
  const multiplier = pricing.condition[conditionKey] || 1;
  const sizeAllowance = sizeNumber * (Number(pricing.sizeRate) || 0);
  const addOnTotal = selectedAddOns.reduce((total, item) => total + configuredAddOnPrices.get(item), 0);
  const travel = isLocal(location) ? 0 : Number(pricing.travelFee) || 0;
  const recurring = frequencyKey === 'Recurring' ? Number(pricing.recurring) || 1 : 1;
  const total = Math.max(
    Number(pricing.minimum) || 0,
    (Number(pricing.base) + sizeAllowance) * multiplier * recurring + addOnTotal + travel,
  );
  const serviceName = resolveServiceName(service);

  return {
    low: Math.round(total * (1 - (Number(pricing.spread) || 0))),
    high: Math.round(total * (1 + (Number(pricing.spread) || 0))),
    breakdown: [
      `${formatCurrency(pricing.base)} base service`,
      `${formatCurrency(sizeAllowance)} size allowance`,
      conditionKey !== 'Standard' ? `${conditionKey} condition adjustment` : 'Standard condition',
      addOnTotal ? `${formatCurrency(addOnTotal)} selected add-ons` : 'No add-ons',
      travel ? `${formatCurrency(travel)} travel allowance` : 'Local service area',
      frequencyKey === 'Recurring' ? 'Recurring-service adjustment' : 'One-time service',
    ],
    inputs: [
      serviceName,
      property || 'Property',
      `${sizeNumber} ${pricing.service.sizeUnit}`,
      `${conditionKey} condition`,
      `${frequencyKey} service`,
      location || 'Twin Cities',
    ],
  };
}

const formatRange = (estimate) =>
  estimate ? `${formatCurrency(estimate.low)}-${formatCurrency(estimate.high)}` : 'To be estimated';

module.exports = {
  getCatalog: getPublicCatalog,
  getPublicCatalog,
  CONDITIONS,
  FREQUENCIES,
  calculateEstimate,
  formatCurrency,
  formatRange,
  serviceNames,
};
