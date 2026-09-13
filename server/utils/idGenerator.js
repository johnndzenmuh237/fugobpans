/**
 * Generates sequential, human-readable IDs like REG-2026-000001,
 * INV-2026-000001, using a row-level lock on id_counters so concurrent
 * requests can never collide (replaces the Firestore transaction
 * approach from the previous build with a plain SQL equivalent).
 */
const { withTransaction } = require('../config/db');

async function nextId(prefix, { yearScoped = true, pad = 6 } = {}) {
  const year = new Date().getFullYear();
  const key = yearScoped ? `${prefix}-${year}` : prefix;

  return withTransaction(async (client) => {
    // Row lock ensures two simultaneous requests never read the same value.
    const { rows } = await client.query(
      `INSERT INTO id_counters (prefix, value) VALUES ($1, 1)
       ON CONFLICT (prefix) DO UPDATE SET value = id_counters.value + 1
       RETURNING value`,
      [key]
    );
    const value = rows[0].value;
    const number = String(value).padStart(pad, '0');
    return yearScoped ? `${prefix}-${year}-${number}` : `${prefix}-${number}`;
  });
}

module.exports = { nextId };
