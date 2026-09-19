const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');

/** Verifies the teacher actually teaches this class before letting them post/edit/delete anything on it. */
async function assertTeacherOwnsClass(employeeId, classId) {
  const { rows } = await query(
    `SELECT 1 FROM classes c
     LEFT JOIN class_subjects cs ON cs.class_id = c.id
     WHERE c.id = $2 AND (c.class_teacher_id = $1 OR cs.teacher_id = $1)`,
    [employeeId, classId]
  );
  if (!rows.length) throw new AppError('You are not assigned to this class.', 403);
}

async function createAssignment({ classId, subjectId, academicSessionId, title, description, dueDate }, actor) {
  if (!classId || !academicSessionId || !title) throw new AppError('classId, academicSessionId and title are required.');
  await assertTeacherOwnsClass(actor.linkedEmployeeId, classId);

  const { rows } = await query(
    `INSERT INTO assignments (class_id, subject_id, academic_session_id, title, description, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [classId, subjectId || null, academicSessionId, title.slice(0, 200), description || null, dueDate || null, actor.uid]
  );
  return rows[0];
}

/** Teacher's view — every assignment they've posted, across all their classes. */
async function listForTeacher(employeeId) {
  const { rows } = await query(
    `SELECT a.*, c.name AS class_name, sub.name AS subject_name
     FROM assignments a
     JOIN classes c ON c.id = a.class_id
     LEFT JOIN subjects sub ON sub.id = a.subject_id
     WHERE c.class_teacher_id = $1 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1)
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [employeeId]
  );
  return rows;
}

/** Student's view — only assignments for their own class. Never anyone else's. */
async function listForStudent(studentId) {
  const { rows } = await query(
    `SELECT a.id, a.title, a.description, a.due_date, a.created_at, c.name AS class_name, sub.name AS subject_name
     FROM assignments a
     JOIN classes c ON c.id = a.class_id
     LEFT JOIN subjects sub ON sub.id = a.subject_id
     WHERE a.class_id = (SELECT class_id FROM students WHERE id = $1)
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [studentId]
  );
  return rows;
}

async function updateAssignment(id, { title, description, dueDate }, actor) {
  const existing = await query('SELECT class_id FROM assignments WHERE id = $1', [id]);
  if (!existing.rows.length) throw new AppError('Assignment not found.', 404);
  await assertTeacherOwnsClass(actor.linkedEmployeeId, existing.rows[0].class_id);

  const { rows } = await query(
    `UPDATE assignments SET title = COALESCE($1,title), description = COALESCE($2,description), due_date = $3, updated_at = now()
     WHERE id = $4 RETURNING *`,
    [title ? title.slice(0, 200) : null, description, dueDate || null, id]
  );
  return rows[0];
}

async function deleteAssignment(id, actor) {
  const existing = await query('SELECT class_id FROM assignments WHERE id = $1', [id]);
  if (!existing.rows.length) throw new AppError('Assignment not found.', 404);
  await assertTeacherOwnsClass(actor.linkedEmployeeId, existing.rows[0].class_id);
  await query('DELETE FROM assignments WHERE id = $1', [id]);
}

module.exports = { createAssignment, listForTeacher, listForStudent, updateAssignment, deleteAssignment };
