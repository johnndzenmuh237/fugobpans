/**
 * Run once after applying migration-6: gives a tracking code to every
 * existing student/employee row that doesn't have one yet (new rows get
 * one automatically going forward — see registrationService.js and
 * employeeService.js). Safe to re-run — only touches NULL rows.
 *
 * Usage: node scripts/backfill-tracking-codes.js
 */
require('dotenv').config();
const { pool } = require('../server/config/db');
const { generateUniqueTrackingCode } = require('../server/utils/trackingCode');

async function backfill(table) {
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE tracking_code IS NULL`);
  console.log(`[backfill] ${rows.length} ${table} row(s) need a tracking code.`);
  for (const row of rows) {
    const code = await generateUniqueTrackingCode(pool, table);
    await pool.query(`UPDATE ${table} SET tracking_code = $1 WHERE id = $2`, [code, row.id]);
  }
  console.log(`[backfill] Done with ${table}.`);
}

(async () => {
  try {
    await backfill('students');
    await backfill('employees');
    console.log('[backfill] All tracking codes assigned.');
  } catch (err) {
    console.error('[backfill] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
