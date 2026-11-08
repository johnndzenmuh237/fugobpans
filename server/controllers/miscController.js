const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');

const notifications = require('../services/notificationService');

const listNotifications = asyncHandler(async (req, res) => {
  const items = await notifications.listForUser(req.user, { limit: req.query.limit, unreadOnly: req.query.unread === '1' });
  res.json(items.map((n) => ({ ...n, read: n.is_read })));
});
const unreadCount = asyncHandler(async (req, res) => res.json({ count: await notifications.unreadCount(req.user) }));
const markNotificationRead = asyncHandler(async (req, res) => { await notifications.markRead(req.user, req.params.id); res.json({ ok: true }); });
const markAllNotificationsRead = asyncHandler(async (req, res) => { await notifications.markAllRead(req.user); res.json({ ok: true }); });

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

module.exports = { listNotifications, unreadCount, markNotificationRead, markAllNotificationsRead, listAuditLogs, getSettings, updateSettings };
