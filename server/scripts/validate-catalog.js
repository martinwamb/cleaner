'use strict';

const assert = require('node:assert/strict');
const catalog = require('../catalog-config.json');

const enabled = catalog.services.filter((service) => service.quoteEnabled);
assert(enabled.length > 0, 'At least one service must be pricing-ready.');
assert.equal(new Set(catalog.services.map((service) => service['Service ID'])).size, catalog.services.length, 'Service IDs must be unique.');

for (const service of enabled) {
  const pricing = catalog.pricing[service['Service ID']];
  assert(pricing, `${service['Service ID']} is enabled without pricing rules.`);
  assert(Number.isFinite(pricing.base), `${service['Service ID']} needs a base price.`);
  assert(Number.isFinite(pricing.sizeRate), `${service['Service ID']} needs a unit rate.`);
  assert(Number.isFinite(pricing.minimum), `${service['Service ID']} needs a minimum price.`);
  assert(pricing.condition.Standard >= 1, `${service['Service ID']} needs a standard multiplier.`);
  assert(pricing.condition.Heavy >= pricing.condition.Standard, `${service['Service ID']} has an invalid heavy multiplier.`);
  assert(pricing.condition.Extreme >= pricing.condition.Heavy, `${service['Service ID']} has an invalid extreme multiplier.`);
  assert(Number.isFinite(pricing.recurring), `${service['Service ID']} needs a recurring multiplier.`);
  assert(Array.isArray(pricing.addOns), `${service['Service ID']} needs structured add-on rules.`);
  assert(pricing.addOns.every((addOn) => Number.isFinite(addOn.price)), `${service['Service ID']} has an invalid add-on price.`);
}

console.log(`Catalog valid: ${catalog.services.length} services, ${enabled.length} pricing-ready, ${catalog.addOns.length} add-ons.`);
