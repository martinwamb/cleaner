'use strict';

const express = require('express');

const { SERVICES, PROPERTY_TYPES, CONDITIONS, FREQUENCIES, ADD_ONS } = require('../pricing');

const router = express.Router();

// The service menu drives both the marketing pages and the quote form, so it
// is served rather than duplicated in the bundle.
router.get('/catalog', (req, res) => {
  res.json({
    services: SERVICES,
    propertyTypes: PROPERTY_TYPES,
    conditions: CONDITIONS,
    frequencies: FREQUENCIES,
    addOns: ADD_ONS.map((addOn) => addOn.name),
  });
});

module.exports = router;
