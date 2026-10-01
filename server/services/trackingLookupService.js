const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * PUBLIC — a guardian/student enters only the tracking code (no login) and
 * gets back everything about THAT ONE student: profile, class, fee/payment
 * status per invoice, exam results, and teacher notes (behavior/complaint/
 * commendation). No list of other students is ever reachable this way —
 * the code is the only key, and it's random (see utils/trackingCode.js),
 * so it can't be guessed by incrementing.
 */
async function lookupStudentByTrackingCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) throw new AppError('Please enter a tracking code.');

  const { rows } = await query(
    `SELECT s.*, c.name AS class_name, a.name AS session_name
     FROM students s
     JOIN classes c ON c.id = s.class_id
     JOIN academic_sessions a ON a.id = s.academic_session_id
     WHERE s.tracking_code = $1`,
    [normalized]
  );
  if (!rows.length) throw new AppError('No record found for that tracking code. Please check it and try again.', 404);
  const student = rows[0];

  const [invoices, results, notes] = await Promise.all([
    query(
      `SELECT i.*, (SELECT COALESCE(json_agg(p.* ORDER BY p.created_at DESC), '[]') FROM payments p WHERE p.invoice_id = i.id AND p.status != 'FAILED') AS payments
       FROM invoices i WHERE i.student_id = $1 ORDER BY i.created_at DESC`,
      [student.id]
    ),
    query(
      `SELECT r.*, sub.name AS subject_name FROM exam_results r JOIN subjects sub ON sub.id = r.subject_id
       WHERE r.student_id = $1 ORDER BY r.academic_session_id DESC, r.term, sub.name`,
      [student.id]
    ),
    query(`SELECT type, note, created_at FROM student_notes WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100`, [student.id]),
  ]);

  const totalDue = invoices.rows.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = invoices.rows.reduce((s, i) => s + Number(i.amount_paid), 0);

  return {
    profile: {
      name: `${student.first_name} ${student.middle_name ? student.middle_name + ' ' : ''}${student.last_name}`,
      studentCode: student.student_code,
      className: student.class_name,
      sessionName: student.session_name,
      status: student.status,
      guardianName: student.guardian_name,
    },
    fees: {
      totalDue, totalPaid, balance: totalDue - totalPaid,
      complete: totalPaid >= totalDue && totalDue > 0,
      invoices: invoices.rows,
    },
    results: results.rows,
    notes: notes.rows,
  };
}

/**
 * PUBLIC — same idea for teachers/workers/employees of every kind: payroll
 * status, attendance summary, and their own leave request history
 * (including any decision note from the Manager).
 */
async function lookupEmployeeByTrackingCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) throw new AppError('Please enter a tracking code.');

  const { rows } = await query(
    `SELECT e.*, p.name AS position_name, d.name AS department_name
     FROM employees e LEFT JOIN positions p ON p.id = e.position_id LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.tracking_code = $1`,
    [normalized]
  );
  if (!rows.length) throw new AppError('No record found for that tracking code. Please check it and try again.', 404);
  const employee = rows[0];

  const [payroll, attendance, leave] = await Promise.all([
    query(
      `SELECT pi.net_salary, pi.amount_paid, (pi.net_salary - pi.amount_paid) AS balance, pi.status, pr.period
       FROM payroll_items pi JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
       WHERE pi.employee_id = $1 ORDER BY pr.period DESC LIMIT 24`,
      [employee.id]
    ),
    query(
      `SELECT status, COUNT(*) FROM employee_attendance WHERE employee_id = $1
       AND date >= date_trunc('month', now()) GROUP BY status`,
      [employee.id]
    ),
    query('SELECT start_date, end_date, leave_type, reason, status, decision_note, requested_at, decided_at FROM employee_leave WHERE employee_id = $1 ORDER BY requested_at DESC', [employee.id]),
  ]);

  return {
    profile: {
      name: `${employee.first_name} ${employee.last_name}`,
      employeeCode: employee.employee_code,
      positionName: employee.position_name,
      departmentName: employee.department_name,
      status: employee.status,
      startDate: employee.start_date,
    },
    payrollHistory: payroll.rows,
    attendanceThisMonth: attendance.rows,
    leaveRequests: leave.rows,
  };
}

module.exports = { lookupStudentByTrackingCode, lookupEmployeeByTrackingCode };
