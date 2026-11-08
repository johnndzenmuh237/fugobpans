const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { notify } = require('./notificationService');
const { isManagementLevel } = require('../middleware/roles');
const { writeAudit } = require('../utils/auditLogger');

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
            r.id AS result_id, r.score, r.max_score, r.remarks, r.status, r.review_note
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
  const isTeacher = !isManagementLevel(actor);
  if (isTeacher) await assertTeacherOwnsClassSubject(actor.linkedEmployeeId, classId, subjectId);
  if (score === undefined || score === null || score === '' || Number(score) < 0) throw new AppError('A valid score is required.');
  if (Number(score) > Number(maxScore)) throw new AppError('Score cannot be higher than the maximum score.');

  const existing = (await query(
    'SELECT id, status FROM exam_results WHERE student_id=$1 AND subject_id=$2 AND term=$3 AND academic_session_id=$4',
    [studentId, subjectId, term, academicSessionId])).rows[0];
  // Approved results are locked for teachers. Only management can correct them, and the old mark is archived by a DB trigger.
  if (existing && existing.status === 'APPROVED' && isTeacher) {
    throw new AppError('This result has been approved and is locked. Ask the Principal or an administrator to reopen it.', 403);
  }
  // Management entering a mark directly is trusted; a teacher's entry waits for review.
  const status = isTeacher ? 'SUBMITTED' : 'APPROVED';

  const { rows } = await query(
    `INSERT INTO exam_results (student_id, class_id, subject_id, academic_session_id, term, score, max_score, remarks, entered_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (student_id, subject_id, term, academic_session_id)
     DO UPDATE SET score = $6, max_score = $7, remarks = $8, entered_by = $9, status = $10, review_note = NULL, updated_at = now()
     RETURNING *`,
    [studentId, classId, subjectId, academicSessionId, term, score, maxScore, remarks || null, actor.uid, status]);

  if (isTeacher) await notifyOncePerBatch(actor, classId, subjectId, term);
  return rows[0];
}

/** One bell notification per teacher/class/subject/term batch (not one per student row). */
async function notifyOncePerBatch(actor, classId, subjectId, term) {
  const { rows: dup } = await query(
    `SELECT 1 FROM notifications WHERE sender_user_id = $1 AND entity = 'results_batch' AND entity_id = $2
       AND message LIKE $3 AND created_at > now() - interval '30 minutes' LIMIT 1`, [actor.uid, classId, `%${term}%`]);
  if (dup.length) return;
  const info = (await query('SELECT c.name AS class_name, s.name AS subject_name FROM classes c, subjects s WHERE c.id=$1 AND s.id=$2', [classId, subjectId])).rows[0] || {};
  await notify({
    toRole: 'MANAGER', sender: actor, department: 'Academics', type: 'INFO',
    title: 'Examination marks submitted',
    message: `${actor.name} submitted ${info.subject_name || 'subject'} marks (${term}) for ${info.class_name || 'a class'}. Review and approve.`,
    link: '/admin/result-approvals.html', entity: 'results_batch', entityId: classId,
  });
}

/** Results waiting for (or returned from) review. */
async function listPending({ status = 'SUBMITTED', classId } = {}) {
  const params = [status];
  let sql = `SELECT r.id, r.score, r.max_score, r.remarks, r.term, r.status, r.updated_at, r.review_note,
                    s.first_name, s.last_name, s.student_code, c.name AS class_name, sub.name AS subject_name,
                    u.name AS entered_by_name, r.class_id, r.subject_id, r.academic_session_id
             FROM exam_results r JOIN students s ON s.id=r.student_id JOIN classes c ON c.id=r.class_id
             JOIN subjects sub ON sub.id=r.subject_id LEFT JOIN users u ON u.id=r.entered_by WHERE r.status=$1`;
  if (classId) { params.push(classId); sql += ` AND r.class_id=$${params.length}`; }
  sql += ' ORDER BY c.name, sub.name, r.term, s.first_name LIMIT 2000';
  return (await query(sql, params)).rows;
}

/** decision: APPROVED | REJECTED | REOPENED (REOPENED sends an approved result back for correction). */
async function reviewResults({ resultIds, decision, note }, actor) {
  if (!Array.isArray(resultIds) || !resultIds.length) throw new AppError('Select at least one result.');
  if (!['APPROVED', 'REJECTED', 'REOPENED'].includes(decision)) throw new AppError('decision must be APPROVED, REJECTED or REOPENED.');
  const newStatus = decision === 'REOPENED' ? 'REJECTED' : decision;
  const { rows } = await query(
    `UPDATE exam_results SET status=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4 WHERE id = ANY($1::uuid[]) RETURNING id, student_id, entered_by, term, subject_id`,
    [resultIds, newStatus, actor.uid, note || null]);
  await writeAudit({ user: actor, action: `RESULTS_${decision}`, entity: 'exam_results', after: { count: rows.length, note: note || null } });

  if (decision === 'APPROVED') {
    // Tell each student's own login and every linked parent that a result is now available.
    const studentIds = [...new Set(rows.map((r) => r.student_id))];
    const { rows: targets } = await query(
      `SELECT u.id FROM users u WHERE u.linked_student_id = ANY($1::uuid[])
       UNION SELECT ps.parent_user_id FROM parent_students ps WHERE ps.student_id = ANY($1::uuid[])`, [studentIds]);
    await notify({ toUserIds: targets.map((t) => t.id), sender: actor, department: 'Academics', type: 'SUCCESS',
      title: 'New result available', message: 'New examination results have been published. Open Results to view them.', link: '/student/dashboard.html#results', entity: 'results' });
  }
  const teachers = [...new Set(rows.map((r) => r.entered_by).filter(Boolean))];
  if (teachers.length) {
    await notify({ toUserIds: teachers, sender: actor, department: 'Academics', type: decision === 'APPROVED' ? 'SUCCESS' : 'WARNING',
      title: `Results ${decision === 'APPROVED' ? 'approved' : 'returned for correction'}`,
      message: note ? `${rows.length} result(s) ${decision.toLowerCase()}. Note: ${note}` : `${rows.length} result(s) ${decision.toLowerCase()}.`,
      link: '/teacher/results.html', alsoOwner: false });
  }
  return { updated: rows.length };
}

/** Every result for one student. Students/parents/public only ever see APPROVED results. */
async function resultsForStudent(studentId, { onlyApproved = false } = {}) {
  const { rows } = await query(
    `SELECT r.*, sub.name AS subject_name, c.name AS class_name, ses.name AS session_name FROM exam_results r
     JOIN subjects sub ON sub.id = r.subject_id JOIN classes c ON c.id = r.class_id
     JOIN academic_sessions ses ON ses.id = r.academic_session_id
     WHERE r.student_id = $1 ${onlyApproved ? "AND r.status = 'APPROVED'" : ''} ORDER BY ses.name DESC, r.term, sub.name`, [studentId]);
  return rows;
}

async function assertTeacherClass(user, classId) {
  if (isManagementLevel(user)) return;
  const { rows } = await query('SELECT 1 FROM classes c LEFT JOIN class_subjects cs ON cs.class_id=c.id WHERE c.id=$2 AND (c.class_teacher_id=$1 OR cs.teacher_id=$1)', [user.linkedEmployeeId, classId]);
  if (!rows.length) throw new AppError('You are not assigned to this class.', 403);
}

module.exports = { myClasses, mySubjects, getResultsSheet, saveResult, resultsForStudent, listPending, reviewResults, assertTeacherClass };
