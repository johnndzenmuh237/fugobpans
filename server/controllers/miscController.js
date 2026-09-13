const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');

const listNotifications = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE to_role = $1 OR to_user_id = $2 ORDER BY created_at DESC LIMIT 50',
    [req.user.role, req.user.uid]
  );
  res.json(rows);
});
const markNotificationRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET read = true WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500');
  res.json(rows);
});

const getSettings = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM school_settings WHERE id = 1');
  res.json(rows[0] || {});
});
const updateSettings = asyncHandler(async (req, res) => {
  const allowed = ['name', 'motto', 'logoUrl', 'address', 'phone', 'whatsapp', 'email', 'website', 'currency', 'attendanceCutoff', 'registrationOpen'];
  const cols = { logoUrl: 'logo_url', attendanceCutoff: 'attendance_cutoff', registrationOpen: 'registration_open' };
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      sets.push(`${cols[key] || key} = $${params.length}`);
    }
  }
  if (!sets.length) throw new AppError('No valid settings fields provided.');
  await query(
    `INSERT INTO school_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
  );
  await query(`UPDATE school_settings SET ${sets.join(', ')} WHERE id = 1`, params);
  res.json({ ok: true });
});

module.exports = { listNotifications, markNotificationRead, listAuditLogs, getSettings, updateSettings };
