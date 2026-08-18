'use strict';

// Illustrative prototype rates. Replace these values after the business
// validates pricing. This module is the single source of truth for estimates:
// the browser never calculates a price, it asks POST /api/estimate.

const SERVICES = [
  {
    id: 'turnover',
    name: 'Apartment turnover',
    description: 'Reliable reset cleaning between tenants, listings, and occupancy windows.',
    buyers: 'Property managers and landlords',
    color: 'sage',
    sizeUnit: 'rooms',
  },
  {
    id: 'deep',
    name: 'Deep cleaning',
    description: 'A detailed clean for homes, offices, and spaces that need a fresh start.',
    buyers: 'Owners and business operators',
    color: 'clay',
    sizeUnit: 'rooms',
  },
  {
    id: 'construction',
    name: 'Post-construction cleanup',
    description: 'Dust, debris, and final-detail cleaning to help a project become move-in ready.',
    buyers: 'Contractors and developers',
    color: 'gold',
    sizeUnit: 'sq ft',
  },
  {
    id: 'commercial',
    name: 'Commercial cleaning',
    description: 'Consistent recurring service for the spaces your team or customers rely on.',
    buyers: 'Business owners and operators',
    color: 'ink',
    sizeUnit: 'sq ft',
  },
];

const PROPERTY_TYPES = [
  'Apartment or multifamily',
  'Single-family home',
  'Office or commercial space',
  'Construction project',
];

const CONDITIONS = ['Standard', 'Heavy', 'Extreme'];
const FREQUENCIES = ['One-time', 'Recurring'];

const ADD_ONS = [
  { name: 'Inside appliances', price: 45 },
  { name: 'Interior windows', price: 35 },
  { name: 'Inside cabinets', price: 55 },
];

const ADD_ON_PRICES = new Map(ADD_ONS.map((addOn) => [addOn.name, addOn.price]));

const PRICING = {
  'Apartment turnover': {
    base: 180,
    sizeRate: 48,
    minimum: 240,
    spread: 0.15,
    condition: { Standard: 1, Heavy: 1.25, Extreme: 1.5 },
  },
  'Deep cleaning': {
    base: 150,
    sizeRate: 42,
    minimum: 180,
    spread: 0.15,
    condition: { Standard: 1, Heavy: 1.25, Extreme: 1.5 },
  },
  'Post-construction cleanup': {
    base: 280,
    sizeRate: 0.22,
    minimum: 450,
    spread: 0.18,
    condition: { Standard: 1, Heavy: 1.2, Extreme: 1.4 },
  },
  'Commercial cleaning': {
    base: 220,
    sizeRate: 0.18,
    minimum: 280,
    spread: 0.18,
    condition: { Standard: 1, Heavy: 1.2, Extreme: 1.35 },
  },
};

// Postal codes we treat as inside the no-travel-fee service area. The old
// prototype substring-matched free text against city names, which charged the
// wrong fee for any address that merely mentioned a city.
const LOCAL_POSTAL_CODES = new Set([
  '55401', '55402', '55403', '55404', '55405', '55406', '55407', '55408',
  '55409', '55410', '55411', '55412', '55413', '55414', '55415', '55416',
  '55417', '55418', '55419', '55423', '55424', '55425', '55426', '55429',
  '55430', '55435', '55436', '55439', '55450', '55454', '55455',
]);

const TRAVEL_FEE = 35;
const RECURRING_MULTIPLIER = 0.9;
const RECURRING_DISCOUNT_LABEL = '10% recurring-service adjustment';

const MAX_SIZE = 1_000_000;

const formatCurrency = (amount) => `$${Math.round(amount).toLocaleString('en-US')}`;

const serviceNames = () => SERVICES.map((service) => service.name);

function isLocal(location) {
  const match = String(location || '').match(/\b\d{5}\b/);
  return match ? LOCAL_POSTAL_CODES.has(match[0]) : false;
}

function normalizeAddOns(addOns) {
  const list = Array.isArray(addOns) ? addOns : addOns ? [addOns] : [];
  return list.map((item) => String(item)).filter((item) => ADD_ON_PRICES.has(item));
}

/**
 * Calculate an illustrative estimate range. Returns null when the inputs are
 * not sufficient or not valid, which callers surface as "to be estimated"
 * rather than as an error.
 */
function calculateEstimate({ service, property, size, condition, frequency, addOns, location }) {
  const config = PRICING[service];
  if (!config) return null;

  const sizeNumber = Number(size);
  if (!Number.isFinite(sizeNumber) || sizeNumber <= 0 || sizeNumber > MAX_SIZE) return null;

  const conditionKey = CONDITIONS.includes(condition) ? condition : 'Standard';
  const frequencyKey = FREQUENCIES.includes(frequency) ? frequency : 'One-time';
  const selectedAddOns = normalizeAddOns(addOns);

  const multiplier = config.condition[conditionKey];
  const sizeAllowance = sizeNumber * config.sizeRate;
  const addOnTotal = selectedAddOns.reduce((total, item) => total + ADD_ON_PRICES.get(item), 0);
  const travel = isLocal(location) ? 0 : TRAVEL_FEE;
  const recurring = frequencyKey === 'Recurring' ? RECURRING_MULTIPLIER : 1;

  const total = Math.max(
    config.minimum,
    (config.base + sizeAllowance) * multiplier * recurring + addOnTotal + travel,
  );

  const serviceMeta = SERVICES.find((entry) => entry.name === service);
  const sizeUnit = serviceMeta ? serviceMeta.sizeUnit : 'units';

  return {
    low: Math.round(total * (1 - config.spread)),
    high: Math.round(total * (1 + config.spread)),
    breakdown: [
      `${formatCurrency(config.base)} base service`,
      `${formatCurrency(sizeAllowance)} size allowance`,
      conditionKey !== 'Standard' ? `${conditionKey} condition adjustment` : 'Standard condition',
      addOnTotal ? `${formatCurrency(addOnTotal)} selected add-ons` : 'No add-ons',
      travel ? `${formatCurrency(travel)} travel allowance` : 'Local service area',
      frequencyKey === 'Recurring' ? RECURRING_DISCOUNT_LABEL : 'One-time service',
    ],
    inputs: [
      service,
      property || 'Property',
      `${sizeNumber} ${sizeUnit}`,
      `${conditionKey} condition`,
      `${frequencyKey} service`,
      location || 'Twin Cities',
    ],
  };
}

const formatRange = (estimate) =>
  estimate ? `${formatCurrency(estimate.low)}-${formatCurrency(estimate.high)}` : 'To be estimated';

module.exports = {
  SERVICES,
  PROPERTY_TYPES,
  CONDITIONS,
  FREQUENCIES,
  ADD_ONS,
  calculateEstimate,
  formatCurrency,
  formatRange,
  serviceNames,
};
