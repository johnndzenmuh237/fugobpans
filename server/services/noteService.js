const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');

/** Teacher adds a behavior/complaint/commendation note about a student in their class. */
async function createStudentNote({ studentId, type, note }, actor) {
  if (!studentId || !note) throw new AppError('studentId and note are required.');
  const allowedTypes = ['BEHAVIOR', 'COMPLAINT', 'COMMENDATION', 'GENERAL'];
  const { rows } = await query(
    `INSERT INTO student_notes (student_id, type, note, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
    [studentId, allowedTypes.includes(type) ? type : 'GENERAL', note, actor.uid]
  );
  await writeAudit({ user: actor, action: 'CREATE_STUDENT_NOTE', entity: 'student_notes', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

/** Staff-side listing (Teacher/Manager viewing a student's profile). */
async function listNotesForStudent(studentId) {
  const { rows } = await query(
    `SELECT n.*, u.name AS author_name FROM student_notes n LEFT JOIN users u ON u.id = n.created_by
     WHERE n.student_id = $1 ORDER BY n.created_at DESC`,
    [studentId]
  );
  return rows;
}

module.exports = { createStudentNote, listNotesForStudent };
