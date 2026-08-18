'use strict';

// Creates or updates the operator account used to sign in to the workspace.
//
//   node scripts/seed-operator.js <email> [name] [password]
//
// When no password is given a strong one is generated and printed once.

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const db = require('../db');

const [, , emailArg, nameArg, passwordArg] = process.argv;

if (!emailArg) {
  console.error('Usage: node scripts/seed-operator.js <email> [name] [password]');
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const name = (nameArg || email.split('@')[0]).trim();
const password = passwordArg || crypto.randomBytes(15).toString('base64url');
const hash = bcrypt.hashSync(password, 12);

const existing = db.prepare('SELECT id FROM operators WHERE email = ?').get(email);

if (existing) {
  db.prepare('UPDATE operators SET name = ?, password_hash = ? WHERE id = ?').run(
    name,
    hash,
    existing.id,
  );
  console.log(`Updated operator ${email}`);
} else {
  db.prepare('INSERT INTO operators (email, name, password_hash) VALUES (?, ?, ?)').run(
    email,
    name,
    hash,
  );
  console.log(`Created operator ${email}`);
}

if (!passwordArg) {
  console.log(`Password: ${password}`);
  console.log('Store this now — it is not recoverable.');
}
