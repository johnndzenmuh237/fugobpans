const { query } = require('../config/db');
const { ROLES, isManagementLevel } = require('../middleware/roles');
const { AppError } = require('../middleware/error-handler');

/** Class ids a teacher is responsible for (class teacher OR teaches a subject there). */
async function teacherClassIds(user) {
  if (!user.linkedEmployeeId) return [];
  const { rows } = await query(
    `SELECT id AS class_id FROM classes WHERE class_teacher_id = $1
     UNION SELECT class_id FROM class_subjects WHERE teacher_id = $1`, [user.linkedEmployeeId]);
  return rows.map((r) => r.class_id);
}

async function parentStudentIds(user) {
  const { rows } = await query('SELECT student_id FROM parent_students WHERE parent_user_id = $1', [user.uid]);
  return rows.map((r) => r.student_id);
}

/**
 * The one rule for "may this person open this student's record?"
 *  management ......... yes (management posts need the "students" permission)
 *  accountant ......... yes (fees)
 *  teacher ............ only students in classes they are assigned to
 *  parent ............. only their own linked children
 *  student ............ only themself
 *  employee/others .... no
 */
async function assertCanAccessStudent(user, studentId) {
  if (isManagementLevel(user)) {
    if (user.role !== ROLES.OWNER && user.role !== ROLES.MANAGER && user.permissions?.students !== true) {
      throw new AppError('Your account has not been granted "students" access.', 403);
    }
    return;
  }
  if (user.role === ROLES.ACCOUNTANT) return;
  if (user.role === ROLES.STUDENT) {
    if (user.linkedStudentId === studentId) return;
  } else if (user.role === ROLES.PARENT) {
    if ((await parentStudentIds(user)).includes(studentId)) return;
  } else if (user.role === ROLES.TEACHER) {
    const { rows } = await query('SELECT class_id FROM students WHERE id = $1', [studentId]);
    if (rows[0] && (await teacherClassIds(user)).includes(rows[0].class_id)) return;
  }
  throw new AppError('You do not have access to this student\'s record.', 403);
}

module.exports = { teacherClassIds, parentStudentIds, assertCanAccessStudent };
