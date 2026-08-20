'use strict';

const db = require('../db');
const { calculateEstimate } = require('../pricing');

const parse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

const requests = db.prepare('SELECT * FROM requests').all();
const updateRequest = db.prepare(`UPDATE requests SET service_id = ?, rate_card_id = ?, rate_card_version = ?, estimate_low = ?, estimate_high = ?, estimate_json = ?, updated_at = datetime('now') WHERE id = ?`);
const updateQuoteVersions = db.prepare(`UPDATE quote_versions SET service_id = ?, rate_card_id = ?, rate_card_version = ?, estimate_low = ?, estimate_high = ?, pricing_snapshot = ? WHERE quote_id = (SELECT id FROM quotes WHERE request_id = ?)`);

let recalculated = 0;
let manualReview = 0;
const run = db.transaction(() => {
  for (const request of requests) {
    const estimate = calculateEstimate({
      service: request.service,
      serviceId: request.service_id,
      property: request.property,
      size: request.size,
      condition: request.condition,
      frequency: request.frequency,
      addOns: parse(request.add_ons, []),
      location: request.location,
    });
    if (!estimate) {
      manualReview += 1;
      updateRequest.run(request.service_id || null, null, '', null, null, null, request.id);
      continue;
    }
    recalculated += 1;
    const snapshot = JSON.stringify(estimate);
    updateRequest.run(estimate.serviceId, estimate.rateCardId, estimate.rateCardVersion, estimate.low, estimate.high, snapshot, request.id);
    updateQuoteVersions.run(estimate.serviceId, estimate.rateCardId, estimate.rateCardVersion, estimate.low, estimate.high, snapshot, request.id);
  }
});

run();
console.log(JSON.stringify({ processed: requests.length, recalculated, manualReview }));
