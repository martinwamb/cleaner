'use strict';

const express = require('express');

const { getPublicCatalog } = require('../catalog');

const router = express.Router();

// The service menu drives both the marketing pages and the quote form, so it
// is served rather than duplicated in the bundle.
router.get('/catalog', (req, res) => {
  const catalog = getPublicCatalog();
  res.json({ ...catalog, addOns: catalog.addOns.map((addOn) => addOn.name) });
});

module.exports = router;
