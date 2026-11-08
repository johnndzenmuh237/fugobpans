const crypto = require('crypto');
const { query, pool } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { hashPassword } = require('../services/authService');
const { writeAudit } = require('../utils/auditLogger');
const { notify } = require('../services/notificationService');
const { assertCanAccessStudent } = require('../utils/access');
const results = require('../services/examResultsService');

const temp = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; return Array.from(crypto.randomBytes(12), (b) => c[b % c.length]).join(''); };

// ---------------------------------------------------------------- management: create & link parent accounts
const createParent = asyncHandler(async (req, res) => {
  const { name, email, phone, password, studentIds = [], relationship } = req.body;
  if (!name || !email) throw new AppError('name and email are required.');
  if (!Array.isArray(studentIds) || !studentIds.length) throw new AppError('Link the parent to at least one student.');
  if (password && String(password).length < 8) throw new AppError('Password must be at least 8 characters.');
  const pw = password || temp();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, phone, created_by, must_change_password) VALUES ($1,$2,$3,'PARENT',$4,$5,true) RETURNING id, name, email`,
      [name, email, await hashPassword(pw), phone || null, req.user.uid]);
    for (const sid of studentIds) {
      await client.query('INSERT INTO parent_students (parent_user_id, student_id, relationship, linked_by) VALUES ($1,$2,$3,$4)', [rows[0].id, sid, relationship || null, req.user.uid]);
    }
    await client.query('COMMIT');
    await writeAudit({ user: req.user, action: 'CREATE_PARENT_ACCOUNT', entity: 'users', entityId: rows[0].id, after: { email, studentIds }, req });
    res.status(201).json({ ...rows[0], temporaryPassword: password ? undefined : pw });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new AppError('An account with that email already exists.', 409);
    if (e.code === '23503') throw new AppError('One of the students does not exist.', 400);
    throw e;
  } finally { client.release(); }
});

const listParents = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.last_login_at,
            COALESCE(json_agg(json_build_object('id', s.id, 'name', s.first_name || ' ' || s.last_name, 'code', s.student_code, 'relationship', ps.relationship)) FILTER (WHERE s.id IS NOT NULL), '[]') AS children
     FROM users u LEFT JOIN parent_students ps ON ps.parent_user_id=u.id LEFT JOIN students s ON s.id=ps.student_id
     WHERE u.role::text = 'PARENT' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 1000`);
  res.json(rows);
});

const linkChild = asyncHandler(async (req, res) => {
  await query('INSERT INTO parent_students (parent_user_id, student_id, relationship, linked_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [req.params.id, req.body.studentId, req.body.relationship || null, req.user.uid]);
  await writeAudit({ user: req.user, action: 'LINK_PARENT_STUDENT', entity: 'users', entityId: req.params.id, after: { studentId: req.body.studentId }, req });
  res.json({ ok: true });
});
const unlinkChild = asyncHandler(async (req, res) => {
  await query('DELETE FROM parent_students WHERE parent_user_id=$1 AND student_id=$2', [req.params.id, req.params.studentId]);
  await writeAudit({ user: req.user, action: 'UNLINK_PARENT_STUDENT', entity: 'users', entityId: req.params.id, after: { studentId: req.params.studentId }, req });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- parent self-service (own children only — enforced on every call)
const myChildren = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.student_code, s.first_name, s.last_name, s.status, c.name AS class_name, ses.name AS session_name, ps.relationship
     FROM parent_students ps JOIN students s ON s.id=ps.student_id JOIN classes c ON c.id=s.class_id JOIN academic_sessions ses ON ses.id=s.academic_session_id
     WHERE ps.parent_user_id=$1 ORDER BY s.first_name`, [req.user.uid]);
  res.json(rows);
});

/** Everything a parent (or the student themself) may see about one child. */
async function childOverview(user, studentId) {
  await assertCanAccessStudent(user, studentId);
  const [stu, invoices, payments, res, att, tt, disc] = await Promise.all([
    query(`SELECT s.id, s.student_code, s.first_name, s.middle_name, s.last_name, s.date_of_birth, s.gender, s.status, s.guardian_name, s.guardian_phone, s.guardian_email,
                  c.name AS class_name, ses.name AS session_name FROM students s JOIN classes c ON c.id=s.class_id JOIN academic_sessions ses ON ses.id=s.academic_session_id WHERE s.id=$1`, [studentId]),
    query(`SELECT id, invoice_number, total_amount, amount_paid, balance, status, created_at FROM invoices WHERE student_id=$1 ORDER BY created_at DESC`, [studentId]),
    query(`SELECT id, receipt_number, amount, method, status, paid_at, created_at FROM payments WHERE student_id=$1 AND status='SUCCESSFUL' ORDER BY created_at DESC`, [studentId]),
    results.resultsForStudent(studentId, { onlyApproved: true }),
    query(`SELECT status, count(*)::int AS n FROM student_attendance WHERE student_id=$1 AND attendance_date >= CURRENT_DATE - 90 GROUP BY status`, [studentId]),
    query(`SELECT t.weekday, t.start_time, t.end_time, t.room, sub.name AS subject_name, e.first_name || ' ' || e.last_name AS teacher_name
           FROM timetable_slots t JOIN subjects sub ON sub.id=t.subject_id LEFT JOIN employees e ON e.id=t.teacher_employee_id
           WHERE t.class_id = (SELECT class_id FROM students WHERE id=$1) ORDER BY t.weekday, t.start_time`, [studentId]),
    query(`SELECT 1 WHERE false`),
  ]);
  if (!stu.rows[0]) throw new AppError('Student not found.', 404);
  const attendance = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }; att.rows.forEach((r) => { attendance[r.status] = r.n; });
  const tot = Object.values(attendance).reduce((a, b) => a + b, 0);
  const totalDue = invoices.rows.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = invoices.rows.reduce((s, i) => s + Number(i.amount_paid), 0);
  const subjects = [...new Map(tt.rows.map((r) => [r.subject_name, r])).keys()];
  return { student: stu.rows[0], fees: { totalDue, totalPaid, balance: totalDue - totalPaid, invoices: invoices.rows, payments: payments.rows },
    results: res, attendance: { ...attendance, total: tot, rate: tot ? Math.round(((attendance.PRESENT + attendance.LATE) / tot) * 1000) / 10 : null },
    timetable: tt.rows, subjects };
}
const childOverviewHandler = asyncHandler(async (req, res) => res.json(await childOverview(req.user, req.params.id)));
const myOverview = asyncHandler(async (req, res) => {
  if (!req.user.linkedStudentId) throw new AppError('This login is not linked to a student record.', 403);
  res.json(await childOverview(req.user, req.user.linkedStudentId));
});

module.exports = { createParent, listParents, linkChild, unlinkChild, myChildren, childOverviewHandler, myOverview };
