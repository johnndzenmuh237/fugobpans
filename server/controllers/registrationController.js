const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const registrationService = require('../services/registrationService');

/** PUBLIC — no account, no document upload. */
const submit = asyncHandler(async (req, res) => {
  const result = await registrationService.submitRegistration(req.body);
  res.status(201).json({
    registrationNumber: result.registration.registration_number,
    studentCode: result.student.student_code,
    className: result.className,
    invoice: { id: result.invoice.id, invoiceNumber: result.invoice.invoice_number, totalAmount: result.invoice.total_amount },
  });
});

const listRegistrations = asyncHandler(async (req, res) => {
  res.json(await registrationService.listRegistrations(req.query));
});

const listStudents = asyncHandler(async (req, res) => {
  let sql = `SELECT s.*, c.name AS class_name, cat.name AS category_name FROM students s
             JOIN classes c ON c.id = s.class_id JOIN categories cat ON cat.id = c.category_id WHERE 1=1`;
  const params = [];
  if (req.query.classId) { params.push(req.query.classId); sql += ` AND s.class_id = $${params.length}`; }
  if (req.query.status) { params.push(req.query.status); sql += ` AND s.status = $${params.length}`; }
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    sql += ` AND (s.first_name ILIKE $${params.length} OR s.last_name ILIKE $${params.length} OR s.student_code ILIKE $${params.length})`;
  }
  sql += ' ORDER BY s.created_at DESC LIMIT 1000';
  const { rows } = await query(sql, params);
  res.json(rows);
});

const getStudentProfile = asyncHandler(async (req, res) => {
  const studentRes = await query(
    `SELECT s.*, c.name AS class_name, cat.name AS category_name FROM students s
     JOIN classes c ON c.id = s.class_id JOIN categories cat ON cat.id = c.category_id WHERE s.id = $1`,
    [req.params.id]
  );
  if (!studentRes.rows.length) throw new AppError('Student not found.', 404);
  const invoicesRes = await query('SELECT * FROM invoices WHERE student_id = $1 ORDER BY created_at DESC', [req.params.id]);
  const paymentsRes = await query('SELECT * FROM payments WHERE student_id = $1 ORDER BY created_at DESC', [req.params.id]);
  const results = await require('../services/examResultsService').resultsForStudent(req.params.id);
  res.json({ ...studentRes.rows[0], invoices: invoicesRes.rows, payments: paymentsRes.rows, results });
});

/** STUDENT self-service — everything the Manager and their teachers have recorded about them (new feature). */
const getMyProfile = asyncHandler(async (req, res) => {
  if (!req.user.linkedStudentId) throw new AppError('This login is not linked to a student record.', 403);
  req.params.id = req.user.linkedStudentId;
  return getStudentProfile(req, res);
});

const setStudentStatus = asyncHandler(async (req, res) => {
  const allowed = ['ACTIVE', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN'];
  if (!allowed.includes(req.body.status)) throw new AppError('Invalid status.');
  await query('UPDATE students SET status = $1, updated_at = now() WHERE id = $2', [req.body.status, req.params.id]);
  res.json({ ok: true });
});

/** MANAGER only — creates a portal login for a student, linked via linked_student_id (still no PUBLIC account creation, spec §2). */
const createStudentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('email and password are required.');
  const { hashPassword } = require('../services/authService');
  const hash = await hashPassword(password);

  const studentRes = await query('SELECT first_name, last_name FROM students WHERE id = $1', [req.params.id]);
  if (!studentRes.rows.length) throw new AppError('Student not found.', 404);
  const s = studentRes.rows[0];

  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, linked_student_id) VALUES ($1,$2,$3,'STUDENT',$4) RETURNING id, name, email, role`,
    [`${s.first_name} ${s.last_name}`, email, hash, req.params.id]
  );
  res.status(201).json(rows[0]);
});

module.exports = { submit, listRegistrations, listStudents, getStudentProfile, getMyProfile, setStudentStatus, createStudentLogin };
