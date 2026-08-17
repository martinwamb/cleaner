'use strict';

const path = require('path');
const Database = require('better-sqlite3');

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
`);

module.exports = db;
