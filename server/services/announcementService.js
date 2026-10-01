const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');

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
  return rows[0];
}

async function setAnnouncementStatus(id, status, actor) {
  if (!['ACTIVE', 'ARCHIVED'].includes(status)) throw new AppError('Invalid status.');
  const { rows } = await query('UPDATE announcements SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (!rows.length) throw new AppError('Announcement not found.', 404);
  await writeAudit({ user: actor, action: 'UPDATE_ANNOUNCEMENT_STATUS', entity: 'announcements', entityId: id, after: { status } });
  return rows[0];
}

module.exports = { listPublicAnnouncements, listAllAnnouncements, createAnnouncement, setAnnouncementStatus };
