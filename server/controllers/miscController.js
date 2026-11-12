const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');

const notifications = require('../services/notificationService');
const { ROLES, MANAGEMENT_ROLES } = require('../middleware/roles');
const { writeAudit } = require('../utils/auditLogger');

const listNotifications = asyncHandler(async (req, res) => {
  const items = await notifications.listForUser(req.user, { limit: req.query.limit, unreadOnly: req.query.unread === '1' });
  res.json(items.map((n) => ({ ...n, read: n.is_read })));
});
const unreadCount = asyncHandler(async (req, res) => res.json({ count: await notifications.unreadCount(req.user) }));
const markNotificationRead = asyncHandler(async (req, res) => { await notifications.markRead(req.user, req.params.id); res.json({ ok: true }); });
const markAllNotificationsRead = asyncHandler(async (req, res) => { await notifications.markAllRead(req.user); res.json({ ok: true }); });

const ALL_ROLES = [ROLES.MANAGER, ...MANAGEMENT_ROLES, ROLES.ACCOUNTANT, ROLES.TEACHER, ROLES.EMPLOYEE, ROLES.STUDENT, ROLES.PARENT];
const AUDIENCE_ROLES = { ALL: ALL_ROLES, STAFF: [ROLES.TEACHER, ROLES.EMPLOYEE, ROLES.ACCOUNTANT], TEACHERS: [ROLES.TEACHER], EMPLOYEES: [ROLES.EMPLOYEE], ACCOUNTANTS: [ROLES.ACCOUNTANT],
  PARENTS: [ROLES.PARENT], STUDENTS: [ROLES.STUDENT], MANAGEMENT: [ROLES.MANAGER, ...MANAGEMENT_ROLES] };

/** Management sends a notification to one person or a whole group. It appears in their bell and is pushed to their phones. */
const sendNotification = asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 150);
  const message = String(req.body.message || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 500);
  if (!title || !message) throw new AppError('A title and a message are required.');
  const audience = String(req.body.audience || '').toUpperCase();
  const base = { title, message, type: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'].includes(req.body.type) ? req.body.type : 'INFO', sender: req.user, department: 'Announcement', entity: 'broadcast', alsoOwner: false };
  if (audience === 'USER') {
    const { rows } = await query(`SELECT id FROM users WHERE id = $1 AND status = 'ACTIVE'`, [req.body.userId]);
    if (!rows.length) throw new AppError('Recipient not found.', 404);
    await notifications.notify({ ...base, toUserId: rows[0].id });
  } else if (AUDIENCE_ROLES[audience]) {
    await notifications.notify({ ...base, toRoles: AUDIENCE_ROLES[audience] });
  } else throw new AppError('Choose who should receive this notification.');
  await writeAudit({ user: req.user, action: 'SEND_NOTIFICATION', entity: 'notifications', after: { audience, title }, req });
  res.status(201).json({ ok: true });
});

const sentNotifications = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT id, title, message, to_role, to_user_id, created_at FROM notifications WHERE sender_user_id = $1 AND entity = 'broadcast' ORDER BY created_at DESC LIMIT 50`, [req.user.uid]);
  res.json(rows);
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

module.exports = { sendNotification, sentNotifications, listNotifications, unreadCount, markNotificationRead, markAllNotificationsRead, listAuditLogs, getSettings, updateSettings };
