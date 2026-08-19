'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const catalogSnapshot = require('./catalog-config.json');

const dbFile = process.env.DB_FILE || path.resolve(__dirname, 'data.db');

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS operators (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    reference     TEXT NOT NULL UNIQUE,
    customer      TEXT NOT NULL,
    organization  TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL,
    phone         TEXT NOT NULL DEFAULT '',
    service       TEXT NOT NULL,
    property      TEXT NOT NULL DEFAULT '',
    size          REAL,
    condition     TEXT NOT NULL DEFAULT 'Standard',
    frequency     TEXT NOT NULL DEFAULT 'One-time',
    add_ons       TEXT NOT NULL DEFAULT '[]',
    location      TEXT NOT NULL DEFAULT '',
    scope         TEXT NOT NULL DEFAULT '',
    timing        TEXT NOT NULL DEFAULT 'Flexible',
    status        TEXT NOT NULL DEFAULT 'New',
    priority      TEXT NOT NULL DEFAULT 'Normal',
    estimate_low  INTEGER,
    estimate_high INTEGER,
    estimate_json TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_requests_status  ON requests (status);
  CREATE INDEX IF NOT EXISTS idx_requests_created ON requests (created_at DESC);

  CREATE TABLE IF NOT EXISTS request_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id  INTEGER NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
    operator_id INTEGER REFERENCES operators (id) ON DELETE SET NULL,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_request ON request_events (request_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS services (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL UNIQUE,
    category              TEXT NOT NULL DEFAULT '',
    status                TEXT NOT NULL DEFAULT 'Draft',
    description           TEXT NOT NULL DEFAULT '',
    buyers                TEXT NOT NULL DEFAULT '',
    color                 TEXT NOT NULL DEFAULT 'clay',
    card_icon             TEXT NOT NULL DEFAULT '▦',
    featured_order        INTEGER NOT NULL DEFAULT 0,
    size_unit             TEXT NOT NULL DEFAULT 'units',
    property_types        TEXT NOT NULL DEFAULT '[]',
    customer_types        TEXT NOT NULL DEFAULT '[]',
    frequency_options     TEXT NOT NULL DEFAULT '[]',
    use_cases             TEXT NOT NULL DEFAULT '',
    included_scope        TEXT NOT NULL DEFAULT '',
    exclusions            TEXT NOT NULL DEFAULT '',
    tags                  TEXT NOT NULL DEFAULT '',
    timing_pattern        TEXT NOT NULL DEFAULT '',
    preferred_lead_time   TEXT NOT NULL DEFAULT '',
    estimated_duration    TEXT NOT NULL DEFAULT '',
    repeat_potential      TEXT NOT NULL DEFAULT '',
    customer_note         TEXT NOT NULL DEFAULT '',
    featured              INTEGER NOT NULL DEFAULT 0,
    pricing_readiness     TEXT NOT NULL DEFAULT 'Needs operator pricing review',
    pricing_basis         TEXT NOT NULL DEFAULT '',
    pricing_model         TEXT NOT NULL DEFAULT 'Custom quote',
    size_input_label      TEXT NOT NULL DEFAULT 'Units or project scope',
    base_price             REAL,
    estimate_spread        REAL,
    unit_rate              REAL,
    minimum_price          REAL,
    standard_multiplier    REAL,
    heavy_multiplier       REAL,
    extreme_multiplier     REAL,
    one_time_multiplier    REAL,
    recurring_multiplier   REAL,
    rush_multiplier        REAL,
    travel_fee_type        TEXT NOT NULL DEFAULT 'Manual review',
    travel_fee_amount      REAL,
    service_area_rule      TEXT NOT NULL DEFAULT '',
    add_on_rules           TEXT NOT NULL DEFAULT '[]',
    version                TEXT NOT NULL DEFAULT 'v1.0',
    effective_date         TEXT,
    changed_by             INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    change_reason          TEXT NOT NULL DEFAULT '',
    draft_snapshot        TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_services_status ON services (status);

  CREATE TABLE IF NOT EXISTS service_change_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id   TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    operator_id  INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,
    version      TEXT NOT NULL,
    change_reason TEXT NOT NULL DEFAULT '',
    snapshot     TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

try { db.exec('ALTER TABLE services ADD COLUMN draft_snapshot TEXT'); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE services ADD COLUMN card_icon TEXT NOT NULL DEFAULT '▦'"); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE services ADD COLUMN featured_order INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }

const seedCatalog = db.transaction(() => {
  if (db.prepare('SELECT COUNT(*) AS count FROM services').get().count > 0) return;

  const insert = db.prepare(`
    INSERT INTO services (
      id, name, category, status, description, buyers, color, card_icon, featured_order, size_unit,
      property_types, customer_types, frequency_options, use_cases,
      included_scope, exclusions, tags, timing_pattern, preferred_lead_time,
      estimated_duration, repeat_potential, customer_note, featured,
      pricing_readiness, pricing_basis, pricing_model, size_input_label,
      base_price, estimate_spread, unit_rate, minimum_price,
      standard_multiplier, heavy_multiplier, extreme_multiplier,
      one_time_multiplier, recurring_multiplier, rush_multiplier,
      travel_fee_type, travel_fee_amount, service_area_rule, add_on_rules,
      version, effective_date, change_reason
    ) VALUES (
      @id, @name, @category, @status, @description, @buyers, @color, @cardIcon, @featuredOrder, @sizeUnit,
      @propertyTypes, @customerTypes, @frequencyOptions, @useCases,
      @includedScope, @exclusions, @tags, @timingPattern, @preferredLeadTime,
      @estimatedDuration, @repeatPotential, @customerNote, @featured,
      @pricingReadiness, @pricingBasis, @pricingModel, @sizeInputLabel,
      @basePrice, @estimateSpread, @unitRate, @minimumPrice,
      @standardMultiplier, @heavyMultiplier, @extremeMultiplier,
      @oneTimeMultiplier, @recurringMultiplier, @rushMultiplier,
      @travelFeeType, @travelFeeAmount, @serviceAreaRule, @addOnRules,
      @version, @effectiveDate, @changeReason
    )
  `);

  for (const item of catalogSnapshot.services) {
    const quoteEnabled = item.quoteEnabled === true;
    const featuredOrder = { turnover: 1, 'res-deep': 2, 'construction-final': 3, 'commercial-recurring': 4 }[item['Service ID']] || 0;
    insert.run({
      id: item['Service ID'],
      name: item['Service Name'],
      category: item.Category || '',
      status: quoteEnabled ? 'Published' : 'Draft',
      description: item['Short Description'] || '',
      buyers: item['Customer Types'] || '',
      color: item.platformId === 'turnover' || item.platformId === 'deep' ? 'sage' : item.platformId === 'commercial' ? 'ink' : 'gold',
      cardIcon: item['Card Icon'] || '▦',
      featuredOrder: Number(item['Featured Order']) || featuredOrder,
      sizeUnit: item.sizeUnit || 'units',
      propertyTypes: JSON.stringify(item.propertyTypes || []),
      customerTypes: JSON.stringify(item.customerTypes || []),
      frequencyOptions: JSON.stringify(item.frequencyOptions || []),
      useCases: item['Use Cases'] || '',
      includedScope: item['Included Scope'] || '',
      exclusions: item['Exclusions / Assumptions'] || '',
      tags: item.Tags || '',
      timingPattern: item['Timing Pattern'] || '',
      preferredLeadTime: item['Preferred Lead Time'] || '',
      estimatedDuration: item['Estimated Duration'] || '',
      repeatPotential: item['Repeat Potential'] || '',
      customerNote: item['Customer-Facing Estimate Note'] || '',
      featured: item.Featured ? 1 : 0,
      pricingReadiness: item['Pricing Readiness'] || 'Needs operator pricing review',
      pricingBasis: item['Pricing Basis'] || '',
      pricingModel: item['Pricing Model'] || 'Custom quote',
      sizeInputLabel: item['Size Input Label'] || 'Units or project scope',
      basePrice: item['Base Price'],
      estimateSpread: item['Estimate Spread'],
      unitRate: item['Unit Rate Low'],
      minimumPrice: item['Minimum Price'],
      standardMultiplier: item['Standard Multiplier'],
      heavyMultiplier: item['Heavy Multiplier'],
      extremeMultiplier: item['Extreme Multiplier'],
      oneTimeMultiplier: item['One-Time Multiplier'],
      recurringMultiplier: item['Recurring Multiplier'],
      rushMultiplier: item['Rush Multiplier'],
      travelFeeType: item['Travel Fee Type'] || 'Manual review',
      travelFeeAmount: item['Travel Fee Amount'],
      serviceAreaRule: item['Service Area Rule'] || '',
      addOnRules: JSON.stringify(item.addOnRules || []),
      version: item['Pricing Version'] || 'v1.0',
      effectiveDate: item['Effective Date'] || null,
      changeReason: item['Change Reason'] || 'Imported from catalog workbook.',
    });
  }
});

seedCatalog();

module.exports = db;
