'use strict';

const { CONDITIONS, FREQUENCIES, serviceNames } = require('./pricing');
const { getPublicCatalog } = require('./catalog');

const LIMITS = {
  customer: 120,
  organization: 160,
  email: 254,
  phone: 40,
  location: 200,
  scope: 2000,
  timing: 160,
  accessNotes: 1000,
  lastCleaned: 120,
  customerExpectations: 1000,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

/**
 * Validate a public quote request. Returns { value } or { errors }.
 * Everything the browser sends is treated as untrusted: the estimate is never
 * accepted from the client, and status/priority are not settable here.
 */
function parseQuoteRequest(body) {
  const errors = [];
  const input = body && typeof body === 'object' ? body : {};
  const catalog = getPublicCatalog();
  const addOnNames = new Set(catalog.addOns.map((addOn) => addOn.name));

  const customer = text(input.customer, LIMITS.customer);
  if (!customer) errors.push('Name is required.');

  const email = text(input.email, LIMITS.email);
  if (!email) errors.push('Email is required.');
  else if (!EMAIL_PATTERN.test(email)) errors.push('Email is not a valid address.');

  const service = text(input.service, 80);
  if (!serviceNames().includes(service)) errors.push('Select one of the listed services.');

  const property = text(input.property, 80);
   if (property && !catalog.propertyTypes.includes(property)) errors.push('Select a listed property type.');

  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) errors.push('Enter an approximate size greater than zero.');

  const condition = CONDITIONS.includes(input.condition) ? input.condition : 'Standard';
  const frequency = FREQUENCIES.includes(input.frequency) ? input.frequency : 'One-time';

  const rawAddOns = Array.isArray(input.addOns) ? input.addOns : input.addOns ? [input.addOns] : [];
  const addOns = [...new Set(rawAddOns.map((item) => String(item)))].filter((item) =>
    addOnNames.has(item),
  );

  const location = text(input.location, LIMITS.location);
  if (!location) errors.push('A neighborhood or address is required.');

  const assessmentType = ['quick', 'photos', 'video', 'walkthrough', 'formal-survey'].includes(input.assessmentType)
    ? input.assessmentType
    : 'quick';

  if (errors.length) return { errors };

  return {
    value: {
      customer,
      organization: text(input.organization, LIMITS.organization),
      email,
      phone: text(input.phone, LIMITS.phone),
      service,
      property,
      size,
      condition,
      frequency,
      addOns,
      location,
      scope: text(input.scope, LIMITS.scope),
      timing: text(input.timing, LIMITS.timing) || 'Flexible',
      assessmentType,
      accessNotes: text(input.accessNotes, LIMITS.accessNotes),
      lastCleaned: text(input.lastCleaned, LIMITS.lastCleaned),
      customerExpectations: text(input.customerExpectations, LIMITS.customerExpectations),
    },
  };
}

/** Looser parse for the live estimate preview: partial input is expected. */
function parseEstimateInput(body) {
  const input = body && typeof body === 'object' ? body : {};
  const addOnNames = new Set(getPublicCatalog().addOns.map((addOn) => addOn.name));
  const rawAddOns = Array.isArray(input.addOns) ? input.addOns : input.addOns ? [input.addOns] : [];
  return {
    service: text(input.service, 80),
    property: text(input.property, 80),
    size: input.size,
    condition: input.condition,
    frequency: input.frequency,
    addOns: [...new Set(rawAddOns.map((item) => String(item)))].filter((item) =>
      addOnNames.has(item),
    ),
    location: text(input.location, LIMITS.location),
  };
}

module.exports = { parseQuoteRequest, parseEstimateInput };
