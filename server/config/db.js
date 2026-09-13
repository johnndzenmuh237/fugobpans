/**
 * PostgreSQL connection pool. Everything in server/ imports `db` from
 * here — no other file ever creates its own connection. Works with any
 * standard Postgres host (Neon, Supabase, Railway, Render, a VPS) since
 * it just needs a DATABASE_URL connection string.
 */
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error(
    '[db] Missing DATABASE_URL env var. Copy .env.example to .env and set it to your Postgres connection string.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle client:', err.message);
});

/** Simple query helper for single statements. */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `fn` inside a single client with a transaction — BEGIN/COMMIT on
 * success, ROLLBACK on any thrown error. Use this for anything that
 * writes to more than one table together (payments, hiring, registration
 * approval), so partial failures never leave the database inconsistent.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
