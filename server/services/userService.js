/** Staff accounts: Admin creates Managers/Accountants, ticks their permissions and assigns properties (spec §22). */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { hashPassword } = require('./authService');
const { writeAudit } = require('../utils/auditLogger');
const { PERMISSIONS } = require('../middleware/roles');
const { requireFields } = require('../utils/sql');

const cleanPerms = (p) => [...new Set((Array.isArray(p) ? p : []).filter((x) => PERMISSIONS.includes(x)))];

async function listUsers() {
  const { rows } = await query(`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.permissions, u.status, u.created_at,
      COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name)) FROM manager_properties mp JOIN properties p ON p.id = mp.property_id WHERE mp.user_id = u.id), '[]') AS properties
    FROM users u ORDER BY (u.role = 'ADMIN') DESC, u.name`);
  return rows;
}

async function setProperties(client, userId, propertyIds) {
  await client.query('DELETE FROM manager_properties WHERE user_id = $1', [userId]);
  for (const pid of [...new Set(propertyIds || [])]) {
    await client.query('INSERT INTO manager_properties (user_id, property_id) VALUES ($1,$2)', [userId, pid]);
  }
}

async function createUser({ name, email, phone, password, role, permissions, propertyIds }, actor) {
  requireFields({ name, email, password, role }, ['name', 'email', 'password', 'role']);
  if (!['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(role)) throw new AppError('Invalid role.');
  if (String(password).length < 8) throw new AppError('Password must be at least 8 characters.');
  const hash = await hashPassword(password);
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role, permissions) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, role, permissions`,
      [name.trim(), email.trim().toLowerCase(), phone || null, hash, role, role === 'MANAGER' ? cleanPerms(permissions) : []]);
    if (role === 'MANAGER') await setProperties(client, rows[0].id, propertyIds);
    return rows[0];
  });
  await writeAudit({ user: actor, action: 'CREATE_USER', entity: 'users', entityId: user.id, after: { email: user.email, role } });
  return user;
}

async function updateUser(id, { name, phone, permissions, propertyIds, status, newPassword }, actor) {
  const { rows: cur } = await query('SELECT * FROM users WHERE id = $1', [id]);
  const target = cur[0];
  if (!target) throw new AppError('User not found.', 404);
  if (id === actor.uid && status === 'SUSPENDED') throw new AppError('You cannot suspend your own account.');
  if (status && !['ACTIVE', 'SUSPENDED'].includes(status)) throw new AppError('Invalid status.');
  if (newPassword !== undefined && newPassword !== '' && String(newPassword).length < 8) throw new AppError('Password must be at least 8 characters.');

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), status = COALESCE($3, status),
         permissions = CASE WHEN role = 'MANAGER' AND $4::text[] IS NOT NULL THEN $4::text[] ELSE permissions END, updated_at = now() WHERE id = $5`,
      [name || null, phone || null, status || null, permissions !== undefined ? cleanPerms(permissions) : null, id]);
    if (target.role === 'MANAGER' && propertyIds !== undefined) await setProperties(client, id, propertyIds);
    if (newPassword) await client.query('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [await hashPassword(newPassword), id]);
  });
  await writeAudit({ user: actor, action: 'UPDATE_USER', entity: 'users', entityId: id, after: { status, permissions, propertyIds, passwordReset: !!newPassword } });
  return { ok: true };
}

module.exports = { listUsers, createUser, updateUser };
