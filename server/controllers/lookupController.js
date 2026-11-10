const { asyncHandler } = require('../middleware/error-handler');
const tracking = require('../services/trackingLookupService');
const { query } = require('../config/db');
const { portalTokenStudentId } = require('../services/verificationService');

/** No-op unless the Owner has switched verification on; then the one-time-code access token must match THIS student. */
const gateStudentLookup = asyncHandler(async (req, res, next) => {
  const { rows } = await query('SELECT require_otp_for_lookup FROM messaging_settings WHERE id = 1').catch(() => ({ rows: [] }));
  if (!rows[0]?.require_otp_for_lookup) return next();
  const code = String(req.params.code || '').trim().toUpperCase();
  const st = (await query('SELECT id FROM students WHERE tracking_code = $1', [code])).rows[0];
  // Same answer for "no such code" and "not verified": an unverified visitor learns nothing.
  if (!st || portalTokenStudentId(req.headers['x-portal-token']) !== st.id) {
    return res.status(401).json({ error: 'For privacy, please verify with the code sent to the guardian\'s phone.', otpRequired: true });
  }
  return next();
});

module.exports = {
  gateStudentLookup,
  lookupStudent: asyncHandler(async (req, res) => res.json(await tracking.lookupStudentByTrackingCode(req.params.code))),
  lookupEmployee: asyncHandler(async (req, res) => res.json(await tracking.lookupEmployeeByTrackingCode(req.params.code))),
};
