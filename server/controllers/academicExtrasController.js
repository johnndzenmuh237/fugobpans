const PDFDocument = require('pdfkit');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');
const { notify } = require('../services/notificationService');
const { assertCanAccessStudent } = require('../utils/access');
const results = require('../services/examResultsService');

// ------------------------------------------------------------------ Terms
const listTerms = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT t.*, s.name AS session_name FROM terms t JOIN academic_sessions s ON s.id=t.academic_session_id ORDER BY s.name DESC, t.start_date NULLS LAST, t.name');
  res.json(rows);
});
const saveTerm = asyncHandler(async (req, res) => {
  const { academicSessionId, name, startDate, endDate, status = 'ACTIVE' } = req.body;
  if (!academicSessionId || !name) throw new AppError('academicSessionId and name are required.');
  const { rows } = await query(
    `INSERT INTO terms (academic_session_id, name, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (academic_session_id, name) DO UPDATE SET start_date=$3, end_date=$4, status=$5 RETURNING *`, [academicSessionId, name, startDate || null, endDate || null, status]);
  await writeAudit({ user: req.user, action: 'SAVE_TERM', entity: 'terms', entityId: rows[0].id, after: rows[0], req });
  res.status(201).json(rows[0]);
});

// ------------------------------------------------------------------ Timetable
const SLOT_SQL = `SELECT t.id, t.class_id, t.weekday, to_char(t.start_time,'HH24:MI') AS start_time, to_char(t.end_time,'HH24:MI') AS end_time, t.room,
  c.name AS class_name, sub.name AS subject_name, t.teacher_employee_id, e.first_name || ' ' || e.last_name AS teacher_name
  FROM timetable_slots t JOIN classes c ON c.id=t.class_id JOIN subjects sub ON sub.id=t.subject_id LEFT JOIN employees e ON e.id=t.teacher_employee_id`;

const listSlots = asyncHandler(async (req, res) => {
  const p = []; let w = '';
  if (req.query.classId) { p.push(req.query.classId); w += ` AND t.class_id = $${p.length}`; }
  if (req.query.teacherId) { p.push(req.query.teacherId); w += ` AND t.teacher_employee_id = $${p.length}`; }
  res.json((await query(`${SLOT_SQL} WHERE 1=1 ${w} ORDER BY t.weekday, t.start_time`, p)).rows);
});
const mySlots = asyncHandler(async (req, res) => {
  if (req.user.role === 'TEACHER') return res.json((await query(`${SLOT_SQL} WHERE t.teacher_employee_id=$1 ORDER BY t.weekday, t.start_time`, [req.user.linkedEmployeeId])).rows);
  if (req.user.role === 'STUDENT') return res.json((await query(`${SLOT_SQL} WHERE t.class_id=(SELECT class_id FROM students WHERE id=$1) ORDER BY t.weekday, t.start_time`, [req.user.linkedStudentId])).rows);
  throw new AppError('No personal timetable for this account type.', 400);
});
const addSlot = asyncHandler(async (req, res) => {
  const { academicSessionId, classId, subjectId, teacherEmployeeId, weekday, startTime, endTime, room } = req.body;
  if (!academicSessionId || !classId || !subjectId || !weekday || !startTime || !endTime) throw new AppError('session, class, subject, weekday, startTime and endTime are required.');
  if (endTime <= startTime) throw new AppError('End time must be after start time.');
  const clash = await query(
    `SELECT 1 FROM timetable_slots WHERE weekday=$1 AND start_time < $3::time AND end_time > $2::time AND (class_id=$4 OR ($5::uuid IS NOT NULL AND teacher_employee_id=$5::uuid)) LIMIT 1`,
    [weekday, startTime, endTime, classId, teacherEmployeeId || null]);
  if (clash.rows.length) throw new AppError('That slot overlaps another lesson for the same class or teacher.', 409);
  const { rows } = await query(
    `INSERT INTO timetable_slots (academic_session_id, class_id, subject_id, teacher_employee_id, weekday, start_time, end_time, room, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [academicSessionId, classId, subjectId, teacherEmployeeId || null, weekday, startTime, endTime, room || null, req.user.uid]);
  if (teacherEmployeeId) {
    const { rows: u } = await query('SELECT id FROM users WHERE linked_employee_id=$1 AND status=\'ACTIVE\'', [teacherEmployeeId]);
    await notify({ toUserIds: u.map((x) => x.id), sender: req.user, department: 'Academics', title: 'Timetable updated', message: 'A lesson was added to your teaching schedule.', link: '/teacher/schedule.html', alsoOwner: false });
  }
  await writeAudit({ user: req.user, action: 'ADD_TIMETABLE_SLOT', entity: 'timetable_slots', entityId: rows[0].id, after: req.body, req });
  res.status(201).json(rows[0]);
});
const deleteSlot = asyncHandler(async (req, res) => {
  await query('DELETE FROM timetable_slots WHERE id=$1', [req.params.id]);
  await writeAudit({ user: req.user, action: 'DELETE_TIMETABLE_SLOT', entity: 'timetable_slots', entityId: req.params.id, req });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ Teacher performance (management only)
const listPerformance = asyncHandler(async (req, res) => res.json((await query('SELECT * FROM employee_performance WHERE employee_id=$1 ORDER BY created_at DESC', [req.params.id])).rows));
const addPerformance = asyncHandler(async (req, res) => {
  const { period, rating, comments } = req.body;
  if (!period || !(Number(rating) >= 1 && Number(rating) <= 5)) throw new AppError('period and a rating from 1 to 5 are required.');
  const { rows } = await query('INSERT INTO employee_performance (employee_id, period, rating, comments, reviewed_by, reviewer_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.params.id, period, rating, comments || null, req.user.uid, req.user.name]);
  await writeAudit({ user: req.user, action: 'ADD_PERFORMANCE_RECORD', entity: 'employee_performance', entityId: rows[0].id, req });
  res.status(201).json(rows[0]);
});

// ------------------------------------------------------------------ Report card (JSON + PDF). Student/parent: approved results only.
async function buildReportCard(user, studentId, { term, sessionId }) {
  await assertCanAccessStudent(user, studentId);
  const onlyApproved = ['STUDENT', 'PARENT', 'ACCOUNTANT'].includes(user.role);
  const stu = (await query(`SELECT s.id, s.student_code, s.first_name, s.last_name, c.name AS class_name, ses.name AS session_name, s.academic_session_id
                            FROM students s JOIN classes c ON c.id=s.class_id JOIN academic_sessions ses ON ses.id=s.academic_session_id WHERE s.id=$1`, [studentId])).rows[0];
  if (!stu) throw new AppError('Student not found.', 404);
  let rows = await results.resultsForStudent(studentId, { onlyApproved });
  const sid = sessionId || stu.academic_session_id;
  rows = rows.filter((r) => r.academic_session_id === sid && (!term || r.term === term));
  const pct = (r) => (Number(r.max_score) ? (Number(r.score) / Number(r.max_score)) * 100 : 0);
  const average = rows.length ? Math.round((rows.reduce((a, r) => a + pct(r), 0) / rows.length) * 10) / 10 : null;
  const att = (await query(`SELECT status, count(*)::int AS n FROM student_attendance WHERE student_id=$1 GROUP BY status`, [studentId])).rows;
  const school = (await query('SELECT name, motto, address, phone FROM school_settings WHERE id=1')).rows[0] || {};
  return { student: stu, school, term: term || 'All terms', rows: rows.map((r) => ({ subject: r.subject_name, term: r.term, score: Number(r.score), max: Number(r.max_score), percent: Math.round(pct(r) * 10) / 10, remarks: r.remarks })), average,
    attendance: Object.fromEntries(att.map((a) => [a.status, a.n])), session: rows[0]?.session_name || stu.session_name };
}
const reportCard = asyncHandler(async (req, res) => res.json(await buildReportCard(req.user, req.params.studentId, { term: req.query.term, sessionId: req.query.sessionId })));
const reportCardPdf = asyncHandler(async (req, res) => {
  const rc = await buildReportCard(req.user, req.params.studentId, { term: req.query.term, sessionId: req.query.sessionId });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-card-${rc.student.student_code}.pdf"`);
  const doc = new PDFDocument({ margin: 50 }); doc.pipe(res);
  doc.fontSize(18).text(rc.school.name || 'School', { align: 'center' });
  if (rc.school.motto) doc.fontSize(9).fillColor('#555').text(rc.school.motto, { align: 'center' }); doc.fillColor('#000').moveDown(0.5);
  doc.fontSize(14).text('REPORT CARD', { align: 'center' }).moveDown();
  doc.fontSize(11).text(`Student: ${rc.student.first_name} ${rc.student.last_name}    Admission no.: ${rc.student.student_code}`);
  doc.text(`Class: ${rc.student.class_name}    Session: ${rc.session}    Term: ${rc.term}`).moveDown();
  const y0 = doc.y; doc.font('Helvetica-Bold').text('Subject', 50, y0).text('Term', 250, y0).text('Score', 340, y0).text('%', 410, y0).text('Remarks', 450, y0); doc.font('Helvetica').moveDown(0.3);
  rc.rows.forEach((r) => { const y = doc.y; doc.text(r.subject, 50, y, { width: 190 }).text(r.term, 250, y, { width: 85 }).text(`${r.score}/${r.max}`, 340, y).text(String(r.percent), 410, y).text(r.remarks || '', 450, y, { width: 110 }); doc.moveDown(0.2); });
  doc.moveDown().font('Helvetica-Bold').text(`Average: ${rc.average ?? 'n/a'}%`).font('Helvetica');
  const a = rc.attendance; doc.text(`Attendance — present ${a.PRESENT || 0}, late ${a.LATE || 0}, absent ${a.ABSENT || 0}, excused ${a.EXCUSED || 0}`);
  if (!rc.rows.length) doc.moveDown().text('No approved results are available for this period yet.');
  doc.end();
});

module.exports = { listTerms, saveTerm, listSlots, mySlots, addSlot, deleteSlot, listPerformance, addPerformance, reportCard, reportCardPdf };
