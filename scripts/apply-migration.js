/**
 * Applies a single SQL migration file to whatever DATABASE_URL points at
 * (read from your local .env — the same one your API uses). This means
 * you never need to open Neon's (or any Postgres host's) website UI —
 * everything happens from your own terminal.
 *
 * Usage:
 *   node scripts/apply-migration.js database/migration-3-reviews.sql
 *   node scripts/apply-migration.js database/migration-4-assignments.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/config/db');

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/apply-migration.js <path-to-sql-file>');
    process.exit(1);
  }
  const fullPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(fullPath, 'utf8');
  console.log(`[apply-migration] Applying ${fileArg} ...`);
  await pool.query(sql);
  console.log('[apply-migration] Done.');
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[apply-migration] Failed:', err.message);
  process.exit(1);
});
