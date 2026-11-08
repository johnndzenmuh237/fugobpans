const { query, pool } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');
const { notify } = require('../services/notificationService');
const { assertCanAccessStudent, teacherClassIds } = require('../utils/access');
const { isManagementLevel } = require('../middleware/roles');

const EDITABLE = ['first_name', 'middle_name', 'last_name', 'date_of_birth', 'gender', 'guardian_name', 'guardian_relationship',
  'guardian_phone', 'guardian_whatsapp', 'guardian_email', 'guardian_address'];
const CAMEL = { firstName: 'first_name', middleName: 'middle_name', lastName: 'last_name', dateOfBirth: 'date_of_birth', guardianName: 'guardian_name',
  guardianRelationship: 'guardian_relationship', guardianPhone: 'guardian_phone', guardianWhatsapp: 'guardian_whatsapp', guardianEmail: 'guardian_email', guardianAddress: 'guardian_address' };

/** People who should hear about something concerning one student: their own login + linked parents. */
async function studentAudience(studentId) {
  const { rows } = await query(
    `SELECT id FROM users WHERE linked_student_id = $1 AND status='ACTIVE'
     UNION SELECT ps.parent_user_id FROM parent_students ps JOIN users u ON u.id=ps.parent_user_id WHERE ps.student_id = $1 AND u.status='ACTIVE'`, [studentId]);
  return rows.map((r) => r.id);
}

// ------------------------------------------------------------------ Update student information
const updateStudent = asyncHandler(async (req, res) => {
  const body = {};
  for (const [k, v] of Object.entries(req.body)) { const col = CAMEL[k] || k; if (EDITABLE.includes(col)) body[col] = v; }
  const cols = Object.keys(body);
  if (!cols.length) throw new AppError('No editable fields were provided.');
  const before = (await query('SELECT * FROM students WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new AppError('Student not found.', 404);
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const { rows } = await query(`UPDATE students SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`, [req.params.id, ...cols.map((c) => body[c] === '' ? null : body[c])]);
  const changed = {}; cols.forEach((c) => { if (String(before[c] ?? '') !== String(rows[0][c] ?? '')) changed[c] = { from: before[c], to: rows[0][c] }; });
  await writeAudit({ user: req.user, action: 'UPDATE_STUDENT', entity: 'students', entityId: before.id, before: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.from])), after: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])), req });
  if (Object.keys(changed).length) {
    await notify({ toRole: 'MANAGER', sender: req.user, department: 'Student Records', title: 'Student record updated',
      message: `${req.user.name} updated ${rows[0].first_name} ${rows[0].last_name}'s record (${Object.keys(changed).join(', ')}).`,
      link: `/admin/student-profile.html?id=${before.id}`, entity: 'students', entityId: before.id });
  }
  res.json(rows[0]);
});

// ------------------------------------------------------------------ Lifecycle: promote / change class / transfer / withdraw / graduate / reinstate
const ACTIONS = {
  PROMOTE: { needs: ['classId', 'academicSessionId'], status: 'ACTIVE', label: 'promoted' },
  CHANGE_CLASS: { needs: ['classId'], status: 'ACTIVE', label: 'moved to a new class' },
  TRANSFER_OUT: { needs: [], status: 'TRANSFERRED', label: 'transferred out of the school' },
  WITHDRAW: { needs: [], status: 'WITHDRAWN', label: 'withdrawn' },
  GRADUATE: { needs: [], status: 'GRADUATED', label: 'graduated' },
  REINSTATE: { needs: [], status: 'ACTIVE', label: 'reinstated' },
};
const lifecycle = asyncHandler(async (req, res) => {
  const { action, classId, academicSessionId, note } = req.body;
  const spec = ACTIONS[action];
  if (!spec) throw new AppError(`action must be one of: ${Object.keys(ACTIONS).join(', ')}.`);
  for (const f of spec.needs) if (!req.body[f]) throw new AppError(`${f} is required for ${action}.`);

  const client = await pool.connect();
  let student;
  try {
    await client.query('BEGIN');
    const cur = (await client.query('SELECT * FROM students WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!cur) throw new AppError('Student not found.', 404);
    // These session variables are read by the DB trigger that writes student_history.
    await client.query("SELECT set_config('app.user_id',$1,true), set_config('app.event_type',$2,true), set_config('app.note',$3,true)", [req.user.uid, action, note || '']);
    const { rows } = await client.query(
      `UPDATE students SET class_id = COALESCE($2, class_id), academic_session_id = COALESCE($3, academic_session_id), status = $4::student_status, updated_at = now()
       WHERE id = $1 RETURNING *`, [req.params.id, classId || null, academicSessionId || null, spec.status]);
    student = rows[0];
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  await writeAudit({ user: req.user, action: `STUDENT_${action}`, entity: 'students', entityId: student.id, after: { classId, academicSessionId, note }, req });
  const full = `${student.first_name} ${student.last_name}`;
  await notify({ toRole: 'MANAGER', sender: req.user, department: 'Student Records', type: 'INFO', title: `Student ${spec.label}`,
    message: `${full} was ${spec.label} by ${req.user.name}.`, link: `/admin/student-profile.html?id=${student.id}`, entity: 'students', entityId: student.id });
  if (['PROMOTE', 'CHANGE_CLASS', 'GRADUATE'].includes(action)) {
    await notify({ toUserIds: await studentAudience(student.id), sender: req.user, department: 'Academics', type: 'SUCCESS',
      title: `${full} was ${spec.label}`, message: note || `${full} was ${spec.label}.`, alsoOwner: false });
  }
  res.json(student);
});

const history = asyncHandler(async (req, res) => {
  await assertCanAccessStudent(req.user, req.params.id);
  const { rows } = await query(
    `SELECT h.*, fc.name AS from_class, tc.name AS to_class, fs.name AS from_session, ts.name AS to_session, u.name AS changed_by_name
     FROM student_history h LEFT JOIN classes fc ON fc.id=h.from_class_id LEFT JOIN classes tc ON tc.id=h.to_class_id
     LEFT JOIN academic_sessions fs ON fs.id=h.from_session_id LEFT JOIN academic_sessions ts ON ts.id=h.to_session_id
     LEFT JOIN users u ON u.id=h.changed_by WHERE h.student_id=$1 ORDER BY h.created_at DESC`, [req.params.id]);
  const revisions = isManagementLevel(req.user)
    ? (await query('SELECT * FROM exam_result_revisions WHERE student_id=$1 ORDER BY archived_at DESC LIMIT 200', [req.params.id])).rows : [];
  res.json({ history: rows, resultRevisions: revisions });
});

// ------------------------------------------------------------------ Discipline (management only)
const listDiscipline = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM disciplinary_records WHERE student_id=$1 ORDER BY incident_date DESC, created_at DESC', [req.params.id]);
  res.json(rows);
});
const addDiscipline = asyncHandler(async (req, res) => {
  const { incidentDate, category, severity = 'MINOR', description, actionTaken } = req.body;
  if (!description) throw new AppError('A description is required.');
  if (!['MINOR', 'MAJOR', 'SEVERE'].includes(severity)) throw new AppError('severity must be MINOR, MAJOR or SEVERE.');
  const { rows } = await query(
    `INSERT INTO disciplinary_records (student_id, incident_date, category, severity, description, action_taken, recorded_by, recorded_by_name)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, incidentDate || null, category || null, severity, description, actionTaken || null, req.user.uid, req.user.name]);
  await writeAudit({ user: req.user, action: 'ADD_DISCIPLINARY_RECORD', entity: 'disciplinary_records', entityId: rows[0].id, after: { severity, category }, req });
  if (severity !== 'MINOR') await notify({ toRole: 'MANAGER', sender: req.user, department: 'Discipline', type: 'WARNING', title: `${severity} disciplinary record`,
    message: `${req.user.name} recorded a ${severity.toLowerCase()} incident.`, link: `/admin/student-profile.html?id=${req.params.id}`, entity: 'students', entityId: req.params.id });
  res.status(201).json(rows[0]);
});

// ------------------------------------------------------------------ Student attendance
const attendanceSheet = asyncHandler(async (req, res) => {
  const { classId, date } = req.query;
  if (!classId || !date) throw new AppError('classId and date are required.');
  if (req.user.role === 'TEACHER' && !(await teacherClassIds(req.user)).includes(classId)) throw new AppError('You are not assigned to this class.', 403);
  const { rows } = await query(
    `SELECT s.id AS student_id, s.student_code, s.first_name, s.last_name, a.status, a.note FROM students s
     LEFT JOIN student_attendance a ON a.student_id = s.id AND a.attendance_date = $2
     WHERE s.class_id = $1 AND s.status = 'ACTIVE' ORDER BY s.first_name, s.last_name`, [classId, date]);
  res.json(rows);
});

const markAttendance = asyncHandler(async (req, res) => {
  const { classId, date, records } = req.body;
  if (!classId || !date || !Array.isArray(records) || !records.length) throw new AppError('classId, date and records are required.');
  if (new Date(date) > new Date(new Date().toISOString().slice(0, 10) + 'T23:59:59Z')) throw new AppError('You cannot record attendance for a future date.');
  if (req.user.role === 'TEACHER' && !(await teacherClassIds(req.user)).includes(classId)) throw new AppError('You are not assigned to this class.', 403);
  const valid = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
  const roster = new Set((await query("SELECT id FROM students WHERE class_id=$1 AND status='ACTIVE'", [classId])).rows.map((r) => r.id));
  const clean = records.filter((r) => roster.has(r.studentId) && valid.includes(r.status));
  if (!clean.length) throw new AppError('No valid records for this class.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of clean) {
      await client.query(
        `INSERT INTO student_attendance (student_id, class_id, attendance_date, status, note, marked_by) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (student_id, attendance_date) DO UPDATE SET status=$4, note=$5, marked_by=$6, class_id=$2, updated_at=now()`,
        [r.studentId, classId, date, r.status, r.note || null, req.user.uid]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  const absent = clean.filter((r) => r.status === 'ABSENT');
  const cls = (await query('SELECT name FROM classes WHERE id=$1', [classId])).rows[0]?.name || 'a class';
  await notify({ toRole: 'MANAGER', sender: req.user, department: 'Attendance', title: 'Student attendance recorded',
    message: `${req.user.name} recorded attendance for ${cls} on ${date}: ${clean.length - absent.length} present/late/excused, ${absent.length} absent.`,
    link: '/admin/student-attendance.html', entity: 'student_attendance', entityId: classId });
  for (const a of absent) {
    const { rows: st } = await query('SELECT first_name, last_name FROM students WHERE id=$1', [a.studentId]);
    await notify({ toUserIds: await studentAudience(a.studentId), sender: req.user, department: 'Attendance', type: 'WARNING',
      title: 'Marked absent', message: `${st[0].first_name} ${st[0].last_name} was marked absent on ${date}.`, link: '/parent/dashboard.html#attendance', alsoOwner: false });
  }
  res.json({ saved: clean.length, absent: absent.length });
});

const studentAttendance = asyncHandler(async (req, res) => {
  await assertCanAccessStudent(req.user, req.params.id);
  const { rows } = await query(
    `SELECT attendance_date, status, note FROM student_attendance WHERE student_id=$1 AND attendance_date >= COALESCE($2::date, CURRENT_DATE - 90) AND attendance_date <= COALESCE($3::date, CURRENT_DATE)
     ORDER BY attendance_date DESC`, [req.params.id, req.query.from || null, req.query.to || null]);
  const summary = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }; rows.forEach((r) => { summary[r.status] += 1; });
  const total = rows.length;
  res.json({ summary, total, attendanceRate: total ? Math.round(((summary.PRESENT + summary.LATE) / total) * 1000) / 10 : null, records: rows });
});

const attendanceOverview = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { rows } = await query(
    `SELECT c.id AS class_id, c.name AS class_name,
            count(*) FILTER (WHERE a.status='PRESENT')::int AS present, count(*) FILTER (WHERE a.status='LATE')::int AS late,
            count(*) FILTER (WHERE a.status='ABSENT')::int AS absent, count(*) FILTER (WHERE a.status='EXCUSED')::int AS excused,
            (SELECT count(*)::int FROM students s WHERE s.class_id=c.id AND s.status='ACTIVE') AS enrolled
     FROM classes c LEFT JOIN student_attendance a ON a.class_id=c.id AND a.attendance_date=$1 GROUP BY c.id, c.name ORDER BY c.name`, [date]);
  res.json({ date, classes: rows });
});

module.exports = { updateStudent, lifecycle, history, listDiscipline, addDiscipline, attendanceSheet, markAttendance, studentAttendance, attendanceOverview };
