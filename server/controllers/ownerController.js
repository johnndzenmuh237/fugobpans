const crypto = require('crypto');
const { query, pool } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { hashPassword } = require('../services/authService');
const { writeAudit } = require('../utils/auditLogger');
const { ROLES, MANAGEMENT_ROLES } = require('../middleware/roles');

// Posts the Owner can create. MANAGER is the original role, kept for existing schools.
const ASSIGNABLE = [...MANAGEMENT_ROLES, ROLES.MANAGER];
const PERMISSION_KEYS = ['students', 'teachers', 'academics', 'finance', 'announcements', 'reports', 'registrations'];

function cleanPermissions(input = {}) {
  const out = {};
  for (const k of PERMISSION_KEYS) out[k] = input[k] === true;
  return out;
}
function tempPassword() {
  // 14 chars, no look-alikes; shown to the Owner once and never stored in plain text.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(14), (b) => chars[b % chars.length]).join('');
}
const PUBLIC_COLS = `u.id, u.name, u.email, u.role, u.status, u.phone, u.job_title, u.department_id,
  d.name AS department_name, u.permissions, u.last_login_at, u.created_at, u.deactivated_at,
  u.deactivation_reason, u.replaced_by`;

async function getTarget(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  const t = rows[0];
  if (!t) throw new AppError('Account not found.', 404);
  if (t.role === ROLES.OWNER) throw new AppError('The Owner account cannot be modified here.', 403);
  if (!ASSIGNABLE.includes(t.role)) throw new AppError('This is not a management account.', 400);
  return t;
}

const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLS} FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.role::text = ANY($1) ORDER BY (u.status = 'ACTIVE') DESC, u.created_at DESC`, [ASSIGNABLE]);
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { name, email, role, jobTitle, phone, departmentId, permissions, initialPassword } = req.body;
  if (!name || !email || !role) throw new AppError('name, email and role are required.');
  if (!ASSIGNABLE.includes(role)) throw new AppError(`role must be one of: ${ASSIGNABLE.join(', ')}.`);
  if (initialPassword && String(initialPassword).length < 8) throw new AppError('Initial password must be at least 8 characters.');

  const password = initialPassword || tempPassword();
  const hash = await hashPassword(password);
  const perms = cleanPermissions(permissions);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, job_title, phone, department_id, permissions, created_by, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id, name, email, role`,
      [name, email, hash, role, jobTitle || null, phone || null, departmentId || null, JSON.stringify(perms), req.user.uid]);
    await client.query(
      `INSERT INTO management_assignments (user_id, position, job_title, department_id, permissions, assigned_by)
       VALUES ($1,$2,$3,$4,$5,$6)`, [rows[0].id, role, jobTitle || null, departmentId || null, JSON.stringify(perms), req.user.uid]);
    await client.query('COMMIT');
    await writeAudit({ user: req.user, action: 'OWNER_CREATE_MANAGEMENT_ACCOUNT', entity: 'users', entityId: rows[0].id, after: { email, role, permissions: perms }, req });
    // The temporary password is returned ONCE so the Owner can hand it over securely.
    res.status(201).json({ ...rows[0], temporaryPassword: initialPassword ? undefined : password });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new AppError('An account with that email already exists.', 409);
    throw e;
  } finally { client.release(); }
});

const update = asyncHandler(async (req, res) => {
  const t = await getTarget(req.params.id);
  const { name, phone, jobTitle, departmentId, permissions, role } = req.body;
  if (role && !ASSIGNABLE.includes(role)) throw new AppError('Invalid role.');
  const perms = permissions ? cleanPermissions(permissions) : t.permissions;
  const { rows } = await query(
    `UPDATE users SET name = COALESCE($2,name), phone = COALESCE($3,phone), job_title = COALESCE($4,job_title),
       department_id = COALESCE($5,department_id), permissions = $6, role = COALESCE($7::user_role, role), updated_at = now()
     WHERE id = $1 RETURNING id, name, email, role, job_title, phone, department_id, permissions`,
    [t.id, name || null, phone || null, jobTitle || null, departmentId || null, JSON.stringify(perms), role || null]);
  await writeAudit({ user: req.user, action: 'OWNER_UPDATE_MANAGEMENT_ACCOUNT', entity: 'users', entityId: t.id,
    before: { role: t.role, permissions: t.permissions, job_title: t.job_title }, after: { role: rows[0].role, permissions: rows[0].permissions, job_title: rows[0].job_title }, req });
  res.json(rows[0]);
});

const resetPassword = asyncHandler(async (req, res) => {
  const t = await getTarget(req.params.id);
  const password = tempPassword();
  await query('UPDATE users SET password_hash = $1, must_change_password = true, failed_attempts = 0, locked_until = NULL WHERE id = $2', [await hashPassword(password), t.id]);
  await writeAudit({ user: req.user, action: 'OWNER_RESET_PASSWORD', entity: 'users', entityId: t.id, req });
  res.json({ ok: true, temporaryPassword: password });
});

/** Revokes login only. The row, its audit trail and everything it recorded stay exactly as they were. */
async function endPost(client, t, actor, reason, replacedBy) {
  await client.query(
    `UPDATE users SET status = 'DEACTIVATED', deactivated_at = now(), deactivated_by = $2, deactivation_reason = $3, replaced_by = $4
     WHERE id = $1`, [t.id, actor.uid, reason || null, replacedBy || null]);
  await client.query(
    `UPDATE management_assignments SET ends_at = now(), end_reason = $2, ended_by = $3 WHERE user_id = $1 AND ends_at IS NULL`,
    [t.id, reason || null, actor.uid]);
}

const deactivate = asyncHandler(async (req, res) => {
  const t = await getTarget(req.params.id);
  if (t.status === 'DEACTIVATED') throw new AppError('Account is already deactivated.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await endPost(client, t, req.user, req.body.reason, null);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await writeAudit({ user: req.user, action: 'OWNER_DEACTIVATE_ACCOUNT', entity: 'users', entityId: t.id, after: { reason: req.body.reason || null }, req });
  res.json({ ok: true });
});

const reactivate = asyncHandler(async (req, res) => {
  const t = await getTarget(req.params.id);
  await query(`UPDATE users SET status = 'ACTIVE', deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL, failed_attempts = 0, locked_until = NULL WHERE id = $1`, [t.id]);
  await query(`INSERT INTO management_assignments (user_id, position, job_title, department_id, permissions, assigned_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [t.id, t.role, t.job_title, t.department_id, JSON.stringify(t.permissions || {}), req.user.uid]);
  await writeAudit({ user: req.user, action: 'OWNER_REACTIVATE_ACCOUNT', entity: 'users', entityId: t.id, req });
  res.json({ ok: true });
});

/** Replace a leaver with a successor: same post, department and permissions; old login revoked; history kept. */
const replace = asyncHandler(async (req, res) => {
  const t = await getTarget(req.params.id);
  const { name, email, phone, initialPassword, reason } = req.body;
  if (!name || !email) throw new AppError('The replacement\'s name and email are required.');
  const password = initialPassword || tempPassword();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, job_title, phone, department_id, permissions, created_by, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id, name, email, role`,
      [name, email, await hashPassword(password), t.role, t.job_title, phone || null, t.department_id, JSON.stringify(t.permissions || {}), req.user.uid]);
    await client.query(
      `INSERT INTO management_assignments (user_id, position, job_title, department_id, permissions, assigned_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [rows[0].id, t.role, t.job_title, t.department_id, JSON.stringify(t.permissions || {}), req.user.uid]);
    await endPost(client, t, req.user, reason || 'Replaced by successor', rows[0].id);
    await client.query('COMMIT');
    await writeAudit({ user: req.user, action: 'OWNER_REPLACE_MANAGER', entity: 'users', entityId: t.id, after: { replacedBy: rows[0].id, newEmail: email }, req });
    res.status(201).json({ ...rows[0], temporaryPassword: initialPassword ? undefined : password });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new AppError('An account with that email already exists.', 409);
    throw e;
  } finally { client.release(); }
});

const history = asyncHandler(async (req, res) => {
  const { rows: [u] } = await query('SELECT id, name, email, role, status FROM users WHERE id = $1', [req.params.id]);
  if (!u) throw new AppError('Account not found.', 404);
  const [assign, audit] = await Promise.all([
    query('SELECT * FROM management_assignments WHERE user_id = $1 ORDER BY starts_at DESC', [u.id]),
    query('SELECT id, action, entity, entity_id, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [u.id]),
  ]);
  res.json({ account: u, assignments: assign.rows, activity: audit.rows });
});

module.exports = { list, create, update, resetPassword, deactivate, reactivate, replace, history, PERMISSION_KEYS };
