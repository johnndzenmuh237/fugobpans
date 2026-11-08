const { AppError } = require('../middleware/error-handler');

/**
 * Builds the SET clause for a partial UPDATE from a camelCase body and a
 * { camelKey: 'snake_column' } map. Only mapped keys are ever written, so a
 * client can never update a column that wasn't explicitly whitelisted.
 * Empty strings become NULL (so clearing an optional field works).
 */
function buildUpdate(body, map, startAt = 1) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] === undefined) continue;
    params.push(body[key] === '' ? null : body[key]);
    sets.push(`${col} = $${startAt + params.length - 1}`);
  }
  if (!sets.length) throw new AppError('No valid fields were provided to update.');
  return { sets: sets.join(', '), params };
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  if (missing.length) throw new AppError(`Missing required field(s): ${missing.join(', ')}.`);
}

/** pg returns NUMERIC/COUNT(bigint) as strings — coerce the listed keys to numbers. */
function numify(row, keys) {
  const out = { ...row };
  for (const k of keys) if (out[k] !== undefined && out[k] !== null) out[k] = Number(out[k]);
  return out;
}

module.exports = { buildUpdate, requireFields, numify };
