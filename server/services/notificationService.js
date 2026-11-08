const { query } = require('../config/db');
const { ROLES, MANAGEMENT_ROLES } = require('../middleware/roles');

const ALL_MANAGEMENT = [ROLES.MANAGER, ...MANAGEMENT_ROLES];

/**
 * Create a notification. Backward compatible with the original
 * notify({ toRole, toUserId, title, message, type, link }) callers.
 *
 *  toRole / toRoles  role-wide notification (one row per role)
 *  toUserId / toUserIds  specific people
 *  sender            req.user (who caused it) — shown in the bell
 *  department        e.g. 'Academics', 'Finance', 'Admissions'
 *  entity/entityId   the record behind it
 *  alsoOwner         the Owner is told about everything management is told (default true)
 * Never throws: a failed notification must not break the action that caused it.
 */
async function notify({ toRole = null, toRoles = [], toUserId = null, toUserIds = [], title, message, type = 'INFO', link = null,
  sender = null, department = null, entity = null, entityId = null, alsoOwner = true }) {
  try {
    const roles = new Set([...(toRole ? [toRole] : []), ...toRoles]);
    if (alsoOwner && [...roles].some((r) => ALL_MANAGEMENT.includes(r))) roles.add(ROLES.OWNER);
    const users = new Set([...(toUserId ? [toUserId] : []), ...toUserIds]);
    const msg = String(message || '').slice(0, 500);
    const insert = (r, u) => query(
      `INSERT INTO notifications (to_role, to_user_id, title, message, type, link, sender_user_id, sender_name, sender_role, department, entity, entity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [r, u, String(title).slice(0, 150), msg, type, link, sender?.uid || null, sender?.name || 'System', sender?.role || null, department, entity, entityId]);
    for (const r of roles) await insert(r, null);
    for (const u of users) await insert(null, u);
  } catch (e) {
    console.error('[notify] failed:', e.message);
  }
}

/** Roles whose role-wide notifications a person should see. Management also sees legacy 'MANAGER' ones. */
function visibleRoles(user) {
  if (user.role === ROLES.OWNER) return [ROLES.OWNER, ...ALL_MANAGEMENT];
  if (MANAGEMENT_ROLES.includes(user.role)) return [user.role, ROLES.MANAGER];
  return [user.role];
}

const VISIBLE_SQL = `(n.to_user_id = $1 OR n.to_role::text = ANY($2))`;

async function listForUser(user, { limit = 40, unreadOnly = false } = {}) {
  const { rows } = await query(
    `SELECT n.id, n.title, n.message, n.type, n.link, n.sender_name, n.sender_role, n.department, n.entity, n.entity_id, n.created_at,
            (r.user_id IS NOT NULL) AS is_read
     FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $1
     WHERE ${VISIBLE_SQL} ${unreadOnly ? 'AND r.user_id IS NULL' : ''}
     ORDER BY n.created_at DESC LIMIT $3`, [user.uid, visibleRoles(user), Math.min(Number(limit) || 40, 200)]);
  return rows;
}

async function unreadCount(user) {
  const { rows } = await query(
    `SELECT count(*)::int AS c FROM notifications n
     WHERE ${VISIBLE_SQL} AND NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $1)`,
    [user.uid, visibleRoles(user)]);
  return rows[0].c;
}

async function markRead(user, id) {
  await query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $1 FROM notifications n WHERE n.id = $3 AND ${VISIBLE_SQL} ON CONFLICT DO NOTHING`,
    [user.uid, visibleRoles(user), id]);
}

async function markAllRead(user) {
  await query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $1 FROM notifications n WHERE ${VISIBLE_SQL} ON CONFLICT DO NOTHING`,
    [user.uid, visibleRoles(user)]);
}

module.exports = { notify, listForUser, unreadCount, markRead, markAllRead, visibleRoles };
