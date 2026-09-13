/**
 * Applies database/schema.sql to whatever DATABASE_URL points at.
 * Safe to run once against a fresh database. Not idempotent by design —
 * running it twice will error on "already exists", which is the correct
 * signal that migrations already ran (use a real migration tool like
 * node-pg-migrate if you need incremental, repeatable migrations later).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/config/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  console.log('[migrate] Applying database/schema.sql ...');
  await pool.query(sql);
  console.log('[migrate] Done.');

  // Seed the singleton settings row with FUGOBPANS's real details from the flyer.
  await pool.query(`
    INSERT INTO school_settings (id, name, motto, address, phone, whatsapp, email, currency)
    VALUES (1, 'Full Gospel Bilingual Nursery and Primary School (FUGOBPANS)',
            'Progressive - Excellence through the fear of the Lord',
            'Mundani, after carrefour Graceland (opposite Full Gospel Church), Souza',
            '678091643', '650873589', '', 'FCFA')
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log('[migrate] School settings seeded from the flyer.');
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('[migrate] Failed:', err.message); process.exit(1); });
