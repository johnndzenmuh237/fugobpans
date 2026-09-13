/**
 * Creates the first MANAGER login. Run once after deployment:
 *   node scripts/create-manager.js "Manager Name" manager@school.com "TempPass123!"
 */
require('dotenv').config();
const { query, pool } = require('../server/config/db');
const { hashPassword } = require('../server/services/authService');

async function main() {
  const [, , name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.error('Usage: node scripts/create-manager.js "Manager Name" manager@school.com "TempPass123!"');
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'MANAGER') RETURNING id, email`,
    [name, email, hash]
  );
  console.log(`✅ MANAGER created.\n   Email: ${rows[0].email}\n   Temp password: ${password}\n   ID: ${rows[0].id}`);
  console.log('   Log in at /login.html and change the password immediately.');
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('Failed to create manager:', err.message); process.exit(1); });
