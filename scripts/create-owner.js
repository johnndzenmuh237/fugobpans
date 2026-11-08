/**
 * One-time secure setup of the School Owner/Director account.
 *   node scripts/create-owner.js "Full Name" owner@school.com
 * - No password is typed on the command line or stored in source. A strong random one is
 *   generated, printed ONCE here, and the Owner must change it at first login.
 *   (Or set OWNER_INITIAL_PASSWORD in your shell for this single run.)
 * - Refuses to run if an Owner already exists: there is only ever one.
 */
require('dotenv').config();
const crypto = require('crypto');
const { query, pool } = require('../server/config/db');
const { hashPassword } = require('../server/services/authService');

async function main() {
  const [, , name, email] = process.argv;
  if (!name || !email) { console.error('Usage: node scripts/create-owner.js "Full Name" owner@school.com'); process.exit(1); }
  const existing = await query("SELECT email FROM users WHERE role::text = 'OWNER' LIMIT 1");
  if (existing.rows[0]) { console.error('An Owner account already exists. Use the Owner login / password reset instead.'); process.exit(1); }

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const password = process.env.OWNER_INITIAL_PASSWORD || Array.from(crypto.randomBytes(16), (b) => chars[b % chars.length]).join('');
  if (password.length < 10) { console.error('OWNER_INITIAL_PASSWORD must be at least 10 characters.'); process.exit(1); }

  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES ($1,$2,$3,'OWNER',true) RETURNING id, email`,
    [name, email, await hashPassword(password)]);
  console.log(`Owner created: ${rows[0].email}`);
  if (!process.env.OWNER_INITIAL_PASSWORD) console.log(`Temporary password (shown once, change at first login): ${password}`);
  console.log('Log in at /owner/login.html');
  await pool.end();
}
main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
