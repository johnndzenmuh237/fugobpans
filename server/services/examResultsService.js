const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');

/**
 * Classes a teacher actually teaches — either as the class teacher, or
 * assigned to a specific subject in that class (class_subjects.teacher_id).
 * This is what "auto-shows which classes a teacher has" means: nothing is
 * typed in by the teacher, it's derived from assignments the Manager made.
 */
async function myClasses(employeeId) {
  const { rows } = await query(
    `SELECT DISTINCT c.id, c.name, cat.name AS category_name,
            (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'ACTIVE') AS student_count
     FROM classes c
     JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN class_subjects cs ON cs.class_id = c.id
     WHERE c.class_teacher_id = $1 OR cs.teacher_id = $1
     ORDER BY c.name`,
    [employeeId]
  );
  return rows;
}

/** Subjects a teacher is assigned to teach, optionally scoped to one class. */
async function mySubjects(employeeId, classId = null) {
  let sql = `SELECT s.id, s.name, cs.class_id FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id WHERE cs.teacher_id = $1`;
  const params = [employeeId];
  if (classId) { params.push(classId); sql += ` AND cs.class_id = $${params.length}`; }
  const { rows } = await query(sql, params);
  return rows;
}

/**
 * The auto-populated roster for a class + term — every ACTIVE student in
 * that class, LEFT JOINed against any score already entered for the given
 * subject/term, so the teacher sees a ready-made list to fill in rather
 * than typing student names (the core ask).
 */
async function getResultsSheet({ classId, subjectId, term, academicSessionId }) {
  const { rows } = await query(
    `SELECT s.id AS student_id, s.student_code, s.first_name, s.last_name,
            r.id AS result_id, r.score, r.max_score, r.remarks
     FROM students s
     LEFT JOIN exam_results r ON r.student_id = s.id AND r.subject_id = $2 AND r.term = $3 AND r.academic_session_id = $4
     WHERE s.class_id = $1 AND s.status = 'ACTIVE'
     ORDER BY s.first_name`,
    [classId, subjectId, term, academicSessionId]
  );
  return rows;
}

/** Verifies the teacher is actually allowed to enter results for this class+subject before writing anything. */
async function assertTeacherOwnsClassSubject(employeeId, classId, subjectId) {
  const { rows } = await query(
    `SELECT 1 FROM classes c
     LEFT JOIN class_subjects cs ON cs.class_id = c.id AND cs.subject_id = $3
     WHERE c.id = $2 AND (c.class_teacher_id = $1 OR cs.teacher_id = $1)`,
    [employeeId, classId, subjectId]
  );
  if (!rows.length) throw new AppError('You are not assigned to this class/subject.', 403);
}

/** Upsert — one call per student score. Re-saving updates instead of duplicating (UNIQUE constraint). */
async function saveResult({ studentId, classId, subjectId, academicSessionId, term, score, maxScore = 20, remarks }, actor) {
  await assertTeacherOwnsClassSubject(actor.linkedEmployeeId, classId, subjectId);
  if (score === undefined || score === null || score < 0) throw new AppError('A valid score is required.');

  const { rows } = await query(
    `INSERT INTO exam_results (student_id, class_id, subject_id, academic_session_id, term, score, max_score, remarks, entered_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (student_id, subject_id, term, academic_session_id)
     DO UPDATE SET score = $6, max_score = $7, remarks = $8, entered_by = $9, updated_at = now()
     RETURNING *`,
    [studentId, classId, subjectId, academicSessionId, term, score, maxScore, remarks || null, actor.uid]
  );
  return rows[0];
}

/** Every result for one student — what the student portal and Manager/teacher profile view show. */
async function resultsForStudent(studentId) {
  const { rows } = await query(
    `SELECT r.*, sub.name AS subject_name, c.name AS class_name FROM exam_results r
     JOIN subjects sub ON sub.id = r.subject_id JOIN classes c ON c.id = r.class_id
     WHERE r.student_id = $1 ORDER BY r.term, sub.name`,
    [studentId]
  );
  return rows;
}

module.exports = { myClasses, mySubjects, getResultsSheet, saveResult, resultsForStudent };
