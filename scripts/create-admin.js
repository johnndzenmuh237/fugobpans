/**
 * Creates the first Administrator.
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' ADMIN_NAME='Your Name' npm run create-admin
 * Further managers/accountants are created from the Admin portal (Managers & Staff).
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../server/config/db');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Administrator';
  if (!email || password.length < 8) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars) first.'); process.exit(1); }
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES ($1,$2,$3,'ADMIN', true)
     ON CONFLICT (email) DO NOTHING RETURNING id`, [name, email, hash]);
  console.log(rows.length ? `[create-admin] Administrator ${email} created. Sign in, then change the password.` : `[create-admin] ${email} already exists — nothing changed.`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
