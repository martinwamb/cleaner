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
    assessment_type TEXT NOT NULL DEFAULT 'quick',
    assessment_status TEXT NOT NULL DEFAULT 'Not started',
    assessment_confidence TEXT NOT NULL DEFAULT 'Unassessed',
    access_notes TEXT NOT NULL DEFAULT '',
    last_cleaned TEXT NOT NULL DEFAULT '',
    customer_expectations TEXT NOT NULL DEFAULT '',
    next_action TEXT NOT NULL DEFAULT 'Review request',
    next_action_due TEXT,
    next_action_owner TEXT NOT NULL DEFAULT 'Operator',
    quote_status TEXT NOT NULL DEFAULT 'Not started',
    quote_notes TEXT NOT NULL DEFAULT '',
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
    event_type  TEXT NOT NULL DEFAULT 'status',
    channel     TEXT NOT NULL DEFAULT 'internal',
    note        TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS rate_cards (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id            TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'Draft',
    location_name         TEXT NOT NULL DEFAULT 'Default service area',
    postal_codes          TEXT NOT NULL DEFAULT '[]',
    pricing_model         TEXT NOT NULL DEFAULT 'Custom quote',
    size_input_label      TEXT NOT NULL DEFAULT 'Units or project scope',
    base_price            REAL,
    unit_rate             REAL,
    minimum_price         REAL,
    estimate_spread       REAL,
    standard_multiplier   REAL,
    heavy_multiplier      REAL,
    extreme_multiplier    REAL,
    one_time_multiplier   REAL,
    recurring_multiplier  REAL,
    travel_fee_amount     REAL,
    add_on_rules          TEXT NOT NULL DEFAULT '[]',
    version               TEXT NOT NULL DEFAULT 'v1.0',
    effective_date        TEXT,
    changed_by            INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    change_reason         TEXT NOT NULL DEFAULT '',
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_rate_cards_service_status ON rate_cards (service_id, status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_cards_published_scope
    ON rate_cards (service_id, location_name) WHERE status = 'Published';

  CREATE TABLE IF NOT EXISTS rate_card_change_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_card_id  INTEGER NOT NULL REFERENCES rate_cards(id) ON DELETE CASCADE,
    operator_id   INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    version       TEXT NOT NULL,
    change_reason TEXT NOT NULL DEFAULT '',
    snapshot      TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    organization  TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);

  CREATE TABLE IF NOT EXISTS properties (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    label         TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    property_type TEXT NOT NULL DEFAULT '',
    access_notes  TEXT NOT NULL DEFAULT '',
    history_notes TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'Requested',
    confidence    TEXT NOT NULL DEFAULT 'Unassessed',
    findings      TEXT NOT NULL DEFAULT '',
    measurements  TEXT NOT NULL DEFAULT '',
    evidence      TEXT NOT NULL DEFAULT '[]',
    assessor_id   INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    requested_at  TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_assessments_request ON assessments (request_id, id DESC);

  CREATE TABLE IF NOT EXISTS quotes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'Draft',
    current_version INTEGER NOT NULL DEFAULT 1,
    valid_until   TEXT,
    sent_at       TEXT,
    decided_at    TEXT,
    decision_note TEXT NOT NULL DEFAULT '',
    acceptance_channel TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_request ON quotes (request_id);

  CREATE TABLE IF NOT EXISTS quote_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id        INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    service         TEXT NOT NULL,
    scope           TEXT NOT NULL DEFAULT '',
    inclusions      TEXT NOT NULL DEFAULT '',
    exclusions      TEXT NOT NULL DEFAULT '',
    assumptions     TEXT NOT NULL DEFAULT '',
    add_ons         TEXT NOT NULL DEFAULT '[]',
    pricing_snapshot TEXT NOT NULL DEFAULT '{}',
    estimate_low    INTEGER,
    estimate_high   INTEGER,
    amount          REAL,
    rate_card_version TEXT NOT NULL DEFAULT '',
    created_by      INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (quote_id, version)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    operator_id   INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    channel       TEXT NOT NULL DEFAULT 'internal',
    direction     TEXT NOT NULL DEFAULT 'internal',
    subject       TEXT NOT NULL DEFAULT '',
    body          TEXT NOT NULL,
    external_ref  TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS follow_ups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    owner_id      INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    due_at        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'Open',
    completed_at  TEXT,
    note          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,
    quote_id      INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'Pending scheduling',
    assigned_to   TEXT NOT NULL DEFAULT '',
    confirmed_at  TEXT,
    started_at    TEXT,
    completed_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    requested_window TEXT NOT NULL DEFAULT '',
    confirmed_window TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'Requested',
    access_confirmed INTEGER NOT NULL DEFAULT 0,
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS handoffs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    accepted_scope TEXT NOT NULL DEFAULT '',
    exclusions   TEXT NOT NULL DEFAULT '',
    access_notes TEXT NOT NULL DEFAULT '',
    customer_expectations TEXT NOT NULL DEFAULT '',
    checklist    TEXT NOT NULL DEFAULT '[]',
    assigned_team TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scope_variances (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    issue         TEXT NOT NULL,
    evidence      TEXT NOT NULL DEFAULT '',
    price_delta   REAL NOT NULL DEFAULT 0,
    time_delta    INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'Needs customer approval',
    customer_decision TEXT NOT NULL DEFAULT '',
    decided_at    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quality_reviews (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    checklist     TEXT NOT NULL DEFAULT '[]',
    issues        TEXT NOT NULL DEFAULT '',
    evidence      TEXT NOT NULL DEFAULT '[]',
    result        TEXT NOT NULL DEFAULT 'Pending',
    reviewed_at   TEXT,
    reviewed_by   INTEGER REFERENCES operators(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS completion_records (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    completed_at  TEXT,
    customer_signoff TEXT NOT NULL DEFAULT 'Pending',
    actual_notes  TEXT NOT NULL DEFAULT '',
    evidence      TEXT NOT NULL DEFAULT '[]',
    repeat_recommended INTEGER NOT NULL DEFAULT 0,
    next_recommended_date TEXT,
    issue_followup TEXT NOT NULL DEFAULT ''
  );
`);

try { db.exec('ALTER TABLE services ADD COLUMN draft_snapshot TEXT'); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE services ADD COLUMN card_icon TEXT NOT NULL DEFAULT '▦'"); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE services ADD COLUMN featured_order INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN assessment_type TEXT NOT NULL DEFAULT 'quick'"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN assessment_status TEXT NOT NULL DEFAULT 'Not started'"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN assessment_confidence TEXT NOT NULL DEFAULT 'Unassessed'"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN access_notes TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN last_cleaned TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN customer_expectations TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN next_action TEXT NOT NULL DEFAULT 'Review request'"); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE requests ADD COLUMN next_action_due TEXT'); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN next_action_owner TEXT NOT NULL DEFAULT 'Operator'"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN quote_status TEXT NOT NULL DEFAULT 'Not started'"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN quote_notes TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE request_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'status'"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE request_events ADD COLUMN channel TEXT NOT NULL DEFAULT 'internal'"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE request_events ADD COLUMN note TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE requests ADD COLUMN customer_id INTEGER'); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE requests ADD COLUMN property_id INTEGER'); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE requests ADD COLUMN service_id TEXT REFERENCES services(id)'); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE requests ADD COLUMN rate_card_id INTEGER REFERENCES rate_cards(id)'); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE requests ADD COLUMN rate_card_version TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
try { db.exec("ALTER TABLE quotes ADD COLUMN acceptance_channel TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE quote_versions ADD COLUMN service_id TEXT REFERENCES services(id)'); } catch { /* already migrated */ }
try { db.exec('ALTER TABLE quote_versions ADD COLUMN rate_card_id INTEGER REFERENCES rate_cards(id)'); } catch { /* already migrated */ }

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

const seedRateCards = db.transaction(() => {
  const insert = db.prepare(`
    INSERT INTO rate_cards (
      service_id, name, status, pricing_model, size_input_label, base_price,
      unit_rate, minimum_price, estimate_spread, standard_multiplier,
      heavy_multiplier, extreme_multiplier, one_time_multiplier,
      recurring_multiplier, travel_fee_amount, add_on_rules, version,
      effective_date, change_reason
    ) VALUES (
      @serviceId, @name, @status, @pricingModel, @sizeInputLabel, @basePrice,
      @unitRate, @minimumPrice, @estimateSpread, @standardMultiplier,
      @heavyMultiplier, @extremeMultiplier, @oneTimeMultiplier,
      @recurringMultiplier, @travelFeeAmount, @addOnRules, @version,
      @effectiveDate, @changeReason
    )
  `);

  for (const service of db.prepare('SELECT * FROM services').all()) {
    if (db.prepare('SELECT 1 FROM rate_cards WHERE service_id = ? LIMIT 1').get(service.id)) continue;
    insert.run({
      serviceId: service.id,
      name: `${service.name} default rate`,
      status: service.status === 'Published' ? 'Published' : 'Draft',
      pricingModel: service.pricing_model,
      sizeInputLabel: service.size_input_label,
      basePrice: service.base_price,
      unitRate: service.unit_rate,
      minimumPrice: service.minimum_price,
      estimateSpread: service.estimate_spread,
      standardMultiplier: service.standard_multiplier,
      heavyMultiplier: service.heavy_multiplier,
      extremeMultiplier: service.extreme_multiplier,
      oneTimeMultiplier: service.one_time_multiplier,
      recurringMultiplier: service.recurring_multiplier,
      travelFeeAmount: service.travel_fee_amount,
      addOnRules: service.add_on_rules || '[]',
      version: service.version || 'v1.0',
      effectiveDate: service.effective_date,
      changeReason: 'Migrated from service pricing fields.',
    });
  }
});

seedRateCards();

db.transaction(() => {
  db.prepare("UPDATE requests SET service_id = (SELECT id FROM services WHERE services.name = requests.service) WHERE service_id IS NULL OR service_id = ''").run();
  db.prepare("UPDATE requests SET rate_card_id = (SELECT id FROM rate_cards WHERE rate_cards.service_id = requests.service_id AND rate_cards.status = 'Published' ORDER BY rate_cards.location_name LIMIT 1), rate_card_version = COALESCE((SELECT version FROM rate_cards WHERE rate_cards.service_id = requests.service_id AND rate_cards.status = 'Published' ORDER BY rate_cards.location_name LIMIT 1), '') WHERE service_id IS NOT NULL AND (rate_card_id IS NULL OR rate_card_version = '')").run();
  db.prepare("UPDATE quote_versions SET service_id = (SELECT service_id FROM requests JOIN quotes ON quotes.request_id = requests.id WHERE quotes.id = quote_versions.quote_id) WHERE service_id IS NULL").run();
  db.prepare("UPDATE quote_versions SET rate_card_id = (SELECT rate_card_id FROM requests JOIN quotes ON quotes.request_id = requests.id WHERE quotes.id = quote_versions.quote_id) WHERE rate_card_id IS NULL").run();
})();

module.exports = db;
