const router = require('express').Router();
const { query } = require('../config/db');
const { asyncHandler: h } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, requirePermission } = require('../middleware/roles');
const users = require('../services/userService');
const settings = require('../services/settingsService');
const pub = require('../services/publicService');

router.use(requireAuth);

// Notification centre (spec §26)
router.get('/notifications', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM notifications WHERE to_role = $1 OR to_user_id = $2 ORDER BY created_at DESC LIMIT 100', [req.user.role, req.user.uid]);
  res.json(rows);
}));
router.post('/notifications/read-all', h(async (req, res) => {
  await query('UPDATE notifications SET read = true WHERE to_role = $1 OR to_user_id = $2', [req.user.role, req.user.uid]);
  res.json({ ok: true });
}));

// Audit log (spec §27) — ADMIN only
router.get('/audit-logs', allowRoles(ROLES.ADMIN), h(async (req, res) => {
  const params = [];
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  if (req.query.action) { params.push(`%${req.query.action}%`); sql += ` AND action ILIKE $${params.length}`; }
  if (req.query.user) { params.push(`%${req.query.user}%`); sql += ` AND user_name ILIKE $${params.length}`; }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  res.json((await query(sql, params)).rows);
}));

// Settings (spec §28)
router.get('/settings', h(async (req, res) => res.json(await settings.getSettings(true))));
router.patch('/settings', allowRoles(ROLES.ADMIN), h(async (req, res) => res.json(await settings.updateSettings(req.body, req.user))));

// Staff accounts & permissions — ADMIN only
router.get('/users', allowRoles(ROLES.ADMIN), h(async (req, res) => res.json(await users.listUsers())));
router.post('/users', allowRoles(ROLES.ADMIN), h(async (req, res) => res.status(201).json(await users.createUser(req.body, req.user))));
router.patch('/users/:id', allowRoles(ROLES.ADMIN), h(async (req, res) => res.json(await users.updateUser(req.params.id, req.body, req.user))));

// Public enquiries (leads)
router.get('/inquiries', requirePermission('properties'), h(async (req, res) => res.json(await pub.listInquiries(req.user, req.query))));
router.patch('/inquiries/:id', requirePermission('properties'), h(async (req, res) => res.json(await pub.updateInquiry(req.params.id, req.body, req.user))));

module.exports = router;
