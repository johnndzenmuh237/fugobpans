const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');

// ---- Categories ----
async function listCategories() {
  const { rows } = await query('SELECT * FROM categories ORDER BY display_order');
  return rows;
}
async function createCategory({ name, displayOrder = 0 }, actor) {
  if (!name) throw new AppError('Category name is required.');
  const { rows } = await query('INSERT INTO categories (name, display_order) VALUES ($1,$2) RETURNING *', [name, displayOrder]);
  await writeAudit({ user: actor, action: 'CREATE_CATEGORY', entity: 'categories', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

// ---- Classes ----
async function listClasses(categoryId) {
  let sql = `SELECT c.*, cat.name AS category_name,
             (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'ACTIVE') AS student_count
             FROM classes c JOIN categories cat ON cat.id = c.category_id WHERE 1=1`;
  const params = [];
  if (categoryId) { params.push(categoryId); sql += ` AND c.category_id = $${params.length}`; }
  sql += ' ORDER BY cat.display_order, c.name';
  const { rows } = await query(sql, params);
  return rows;
}
async function createClass({ name, categoryId, capacity }, actor) {
  if (!name || !categoryId) throw new AppError('name and categoryId are required.');
  const { rows } = await query('INSERT INTO classes (name, category_id, capacity) VALUES ($1,$2,$3) RETURNING *', [name, categoryId, capacity || null]);
  await writeAudit({ user: actor, action: 'CREATE_CLASS', entity: 'classes', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}
async function assignClassTeacher(classId, employeeId, actor) {
  await query('UPDATE classes SET class_teacher_id = $1 WHERE id = $2', [employeeId, classId]);
  await writeAudit({ user: actor, action: 'ASSIGN_CLASS_TEACHER', entity: 'classes', entityId: classId, after: { employeeId } });
}

// ---- Subjects (new feature: needed for exam results) ----
async function listSubjects() {
  const { rows } = await query('SELECT * FROM subjects ORDER BY name');
  return rows;
}
async function createSubject({ name }, actor) {
  if (!name) throw new AppError('Subject name is required.');
  const { rows } = await query('INSERT INTO subjects (name) VALUES ($1) RETURNING *', [name]);
  await writeAudit({ user: actor, action: 'CREATE_SUBJECT', entity: 'subjects', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}
/** Assigns a teacher to teach a subject in a class — this is what powers the teacher's auto-derived class/subject list for results entry. */
async function assignSubjectTeacher(classId, { subjectId, teacherId }, actor) {
  if (!subjectId || !teacherId) throw new AppError('subjectId and teacherId are required.');
  await query(
    `INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ($1,$2,$3)
     ON CONFLICT (class_id, subject_id) DO UPDATE SET teacher_id = $3`,
    [classId, subjectId, teacherId]
  );
  await writeAudit({ user: actor, action: 'ASSIGN_SUBJECT_TEACHER', entity: 'class_subjects', entityId: classId, after: { subjectId, teacherId } });
}

// ---- Fee structures ----
async function createFeeStructure({ academicSessionId, classId, registrationFee = 0, schoolFee = 0, otherFees = 0, installmentAllowed = true }, actor) {
  if (!academicSessionId || !classId) throw new AppError('academicSessionId and classId are required.');
  const { rows } = await query(
    `INSERT INTO fee_structures (academic_session_id, class_id, registration_fee, school_fee, other_fees, installment_allowed)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (academic_session_id, class_id) DO UPDATE SET registration_fee=$3, school_fee=$4, other_fees=$5, installment_allowed=$6
     RETURNING *`,
    [academicSessionId, classId, registrationFee, schoolFee, otherFees, installmentAllowed]
  );
  await writeAudit({ user: actor, action: 'SET_FEE_STRUCTURE', entity: 'fee_structures', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}
async function listFeeStructures(filters = {}) {
  let sql = `SELECT f.*, c.name AS class_name, s.name AS session_name FROM fee_structures f
             JOIN classes c ON c.id = f.class_id JOIN academic_sessions s ON s.id = f.academic_session_id WHERE 1=1`;
  const params = [];
  if (filters.academicSessionId) { params.push(filters.academicSessionId); sql += ` AND f.academic_session_id = $${params.length}`; }
  const { rows } = await query(sql, params);
  return rows;
}

// ---- Academic sessions ----
async function listSessions() {
  const { rows } = await query('SELECT * FROM academic_sessions ORDER BY start_date DESC');
  return rows;
}
async function createSession({ name, startDate, endDate }, actor) {
  if (!name) throw new AppError('Session name is required.');
  const { rows } = await query('INSERT INTO academic_sessions (name, start_date, end_date) VALUES ($1,$2,$3) RETURNING *', [name, startDate || null, endDate || null]);
  await writeAudit({ user: actor, action: 'CREATE_SESSION', entity: 'academic_sessions', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

module.exports = {
  listCategories, createCategory,
  listClasses, createClass, assignClassTeacher,
  listSubjects, createSubject, assignSubjectTeacher,
  createFeeStructure, listFeeStructures,
  listSessions, createSession,
};
