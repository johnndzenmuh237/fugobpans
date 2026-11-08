const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');

const DEFAULTS = {
  id: 1, name: 'FUGOBPAN Properties', tagline: 'Homes, lands & property management you can trust',
  currency: 'FCFA', grace_period_days: 5, late_fee_percent: 0, due_soon_days: 7,
};
let cache = null;
let cachedAt = 0;

async function getSettings(force = false) {
  if (!force && cache && Date.now() - cachedAt < 30000) return cache;
  const { rows } = await query('SELECT * FROM company_settings WHERE id = 1');
  cache = { ...DEFAULTS, ...(rows[0] || {}) };
  cachedAt = Date.now();
  return cache;
}

/** Only the fields safe to show to the public (contact details, MoMo pay-to numbers). */
async function getPublicSettings() {
  const s = await getSettings();
  const { id, grace_period_days, late_fee_percent, due_soon_days, ...pub } = s; // eslint-disable-line no-unused-vars
  return pub;
}

const FIELD_MAP = {
  name: 'name', tagline: 'tagline', logoUrl: 'logo_url', address: 'address', phone: 'phone', whatsapp: 'whatsapp',
  email: 'email', website: 'website', currency: 'currency', gracePeriodDays: 'grace_period_days',
  lateFeePercent: 'late_fee_percent', dueSoonDays: 'due_soon_days', momoMtnNumber: 'momo_mtn_number',
  momoMtnName: 'momo_mtn_name', momoOrangeNumber: 'momo_orange_number', momoOrangeName: 'momo_orange_name',
  paymentInstructions: 'payment_instructions', supportCallNumber: 'support_call_number',
};

async function updateSettings(body, actor) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(FIELD_MAP)) {
    if (body[key] !== undefined) { params.push(body[key] === '' ? null : body[key]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) throw new AppError('No valid settings fields provided.');
  await query(`INSERT INTO company_settings (id, name) VALUES (1, 'FUGOBPAN Properties') ON CONFLICT (id) DO NOTHING`);
  await query(`UPDATE company_settings SET ${sets.join(', ')} WHERE id = 1`, params);
  cache = null;
  await writeAudit({ user: actor, action: 'UPDATE_SETTINGS', entity: 'company_settings', after: body });
  return getSettings(true);
}

module.exports = { getSettings, getPublicSettings, updateSettings };
