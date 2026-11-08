/**
 * Brings an EXISTING database up to date (safe to run repeatedly, e.g. on every Render deploy).
 *   Fresh database:   npm run migrate      (applies schema.sql)   then   npm run upgrade-db
 *   Existing database: npm run upgrade-db
 * Applies migrations 6, 7 and 8 once each and records them in schema_migrations.
 * Nothing is dropped or rewritten; migrations 7 and 8 only add tables/columns/triggers.
 * Works on Neon (use the DIRECT connection string, not the "-pooler" one, for migrations).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/config/db');

const STEPS = [
  { name: 'migration-6-tracking-leave-announcements', alreadyThere: "SELECT to_regclass('public.employee_leave') IS NOT NULL AS yes" },
  { name: 'migration-7-owner-management', alreadyThere: null },
  { name: 'migration-8-school-platform', alreadyThere: null },
];

async function main() {
  const hasUsers = (await pool.query("SELECT to_regclass('public.users') IS NOT NULL AS yes")).rows[0].yes;
  if (!hasUsers) { console.error('[upgrade-db] No schema found. Run "npm run migrate" first.'); process.exit(1); }
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const step of STEPS) {
    const done = (await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [step.name])).rows.length;
    if (done) { console.log(`[upgrade-db] ${step.name}: already applied`); continue; }
    if (step.alreadyThere && (await pool.query(step.alreadyThere)).rows[0].yes) {
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [step.name]);
      console.log(`[upgrade-db] ${step.name}: objects already exist, recorded`); continue;
    }
    console.log(`[upgrade-db] applying ${step.name} ...`);
    await pool.query(fs.readFileSync(path.join(__dirname, `../database/${step.name}.sql`), 'utf8'));
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [step.name]);
    console.log(`[upgrade-db] ${step.name}: done`);
  }
  await pool.end();
}
main().catch((e) => { console.error('[upgrade-db] Failed:', e.message); process.exit(1); });
