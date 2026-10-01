/**
 * Tracking codes are deliberately NOT sequential IDs (unlike REG-/STU-/
 * EMP- numbers) — a sequential code would let anyone guess a neighbor's
 * code just by incrementing it. Instead this is a short random code from
 * an alphabet that excludes visually-confusable characters (0/O, 1/I/L),
 * so it's easy to read off a printed slip and hard to mistype.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length = 9) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Generates a tracking code and retries on the rare chance of a collision
 * with an existing one in `table`. `client` is a pg client/pool — works
 * both inside a transaction and with the plain pool.
 */
async function generateUniqueTrackingCode(client, table) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE tracking_code = $1`, [code]);
    if (!rows.length) return code;
  }
  throw new Error(`Could not generate a unique tracking code for ${table} after 8 attempts.`);
}

module.exports = { generateUniqueTrackingCode };
