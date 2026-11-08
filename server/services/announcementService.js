const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');
const { notify } = require('./notificationService');

/** PUBLIC — parents/anyone can read active announcements without logging in. */
async function listPublicAnnouncements() {
  const { rows } = await query(
    `SELECT id, title, body, audience, pinned, created_at FROM announcements
     WHERE status = 'ACTIVE' AND audience IN ('ALL', 'PARENTS')
     ORDER BY pinned DESC, created_at DESC LIMIT 200`
  );
  return rows;
}

/** Manager/Teacher-facing listing — includes staff-only and archived items. */
async function listAllAnnouncements() {
  const { rows } = await query('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 500');
  return rows;
}

async function createAnnouncement({ title, body, audience, pinned }, actor) {
  if (!title || !body) throw new AppError('title and body are required.');
  const { rows } = await query(
    `INSERT INTO announcements (title, body, audience, pinned, posted_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [title, body, audience || 'ALL', !!pinned, actor.uid]
  );
  await writeAudit({ user: actor, action: 'CREATE_ANNOUNCEMENT', entity: 'announcements', entityId: rows[0].id, after: rows[0] });
  const aud = rows[0].audience;
  const toRoles = aud === 'PARENTS' ? ['PARENT'] : aud === 'STAFF' ? ['TEACHER', 'EMPLOYEE', 'ACCOUNTANT', 'MANAGER', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ADMINISTRATOR', 'ACADEMIC_ADMIN']
    : ['PARENT', 'STUDENT', 'TEACHER', 'EMPLOYEE', 'ACCOUNTANT', 'MANAGER', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ADMINISTRATOR', 'ACADEMIC_ADMIN'];
  await notify({ toRoles, sender: actor, department: 'Administration', type: 'INFO', title: `Announcement: ${title}`.slice(0, 150),
    message: String(body).slice(0, 300), link: '/messages.html#announcements', entity: 'announcements', entityId: rows[0].id });
  return rows[0];
}

async function setAnnouncementStatus(id, status, actor) {
  if (!['ACTIVE', 'ARCHIVED'].includes(status)) throw new AppError('Invalid status.');
  const { rows } = await query('UPDATE announcements SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (!rows.length) throw new AppError('Announcement not found.', 404);
  await writeAudit({ user: actor, action: 'UPDATE_ANNOUNCEMENT_STATUS', entity: 'announcements', entityId: id, after: { status } });
  return rows[0];
}

/** What a logged-in person is meant to see. */
async function listForRole(role) {
  const staff = !['PARENT', 'STUDENT'].includes(role);
  const { rows } = await query(
    `SELECT id, title, body, audience, pinned, created_at FROM announcements WHERE status='ACTIVE'
     AND (audience = 'ALL' OR (audience = 'PARENTS' AND $1::text IN ('PARENT','STUDENT')) OR (audience = 'STAFF' AND $2::boolean))
     ORDER BY pinned DESC, created_at DESC LIMIT 200`, [role, staff]);
  return rows;
}

module.exports = { listForRole, listPublicAnnouncements, listAllAnnouncements, createAnnouncement, setAnnouncementStatus };
