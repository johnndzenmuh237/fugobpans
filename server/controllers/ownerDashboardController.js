const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { MANAGEMENT_ROLES } = require('../middleware/roles');
const notifications = require('../services/notificationService');

const num = (v) => Number(v || 0);
const MGMT = ['MANAGER', ...MANAGEMENT_ROLES];

/** Every figure here is a live query against the database — nothing is cached or hard-coded. */
const overview = asyncHandler(async (req, res) => {
  const [counts, enrol, newRegs, stuAtt, empAtt, perf, fees, expenses, trend, pending, activity, ann] = await Promise.all([
    query(`SELECT
      (SELECT count(*)::int FROM students WHERE status='ACTIVE') AS students,
      (SELECT count(*)::int FROM employees e JOIN positions p ON p.id=e.position_id WHERE e.status='ACTIVE' AND p.name ILIKE '%teach%') AS teachers,
      (SELECT count(*)::int FROM employees WHERE status='ACTIVE') AS employees,
      (SELECT count(*)::int FROM classes) AS classes,
      (SELECT count(*)::int FROM departments) AS departments,
      (SELECT count(*)::int FROM users WHERE role::text = ANY($1) AND status='ACTIVE') AS administrators,
      (SELECT count(*)::int FROM users WHERE role::text = 'PARENT' AND status='ACTIVE') AS parents`, [MGMT]),
    query(`SELECT c.id AS class_id, c.name AS class_name, count(s.id)::int AS students FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.status='ACTIVE' GROUP BY c.id, c.name ORDER BY c.name`),
    query(`SELECT count(*) FILTER (WHERE created_at >= CURRENT_DATE - 30)::int AS last_30_days, count(*) FILTER (WHERE created_at >= CURRENT_DATE - 7)::int AS last_7_days FROM students`),
    query(`SELECT count(*) FILTER (WHERE status IN ('PRESENT','LATE'))::int AS present, count(*)::int AS marked FROM student_attendance WHERE attendance_date = CURRENT_DATE`),
    query(`SELECT count(*) FILTER (WHERE status::text IN ('PRESENT','LATE'))::int AS present, count(*)::int AS marked FROM employee_attendance WHERE date = CURRENT_DATE`),
    query(`SELECT c.name AS class_name, round(avg(r.score / NULLIF(r.max_score,0) * 100)::numeric, 1) AS average, count(*)::int AS entries,
                  round((count(*) FILTER (WHERE r.score / NULLIF(r.max_score,0) >= 0.5) * 100.0 / NULLIF(count(*),0))::numeric, 1) AS pass_rate
           FROM exam_results r JOIN classes c ON c.id=r.class_id WHERE r.status='APPROVED' GROUP BY c.name ORDER BY c.name`),
    query(`SELECT COALESCE(sum(total_amount),0) AS expected, COALESCE(sum(amount_paid),0) AS collected, COALESCE(sum(balance),0) AS outstanding FROM invoices`),
    query(`SELECT COALESCE(sum(amount),0) AS total, COALESCE(sum(amount) FILTER (WHERE expense_date >= date_trunc('month', CURRENT_DATE)),0) AS this_month,
                  (SELECT count(*)::int FROM expenses WHERE approval_status='PENDING') AS pending FROM expenses WHERE approval_status='APPROVED'`),
    query(`WITH m AS (SELECT to_char(d,'YYYY-MM') AS month FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months', date_trunc('month', CURRENT_DATE), interval '1 month') d)
           SELECT m.month,
             COALESCE((SELECT sum(amount) FROM payments p WHERE p.status='SUCCESSFUL' AND to_char(p.paid_at,'YYYY-MM')=m.month),0) AS collected,
             COALESCE((SELECT sum(amount) FROM expenses e WHERE e.approval_status='APPROVED' AND to_char(e.expense_date,'YYYY-MM')=m.month),0) AS expenses FROM m ORDER BY m.month`),
    query(`SELECT (SELECT count(*)::int FROM exam_results WHERE status='SUBMITTED') AS results,
                  (SELECT count(*)::int FROM expenses WHERE approval_status='PENDING') AS expenses,
                  (SELECT count(*)::int FROM employee_leave WHERE status::text = 'PENDING') AS leave`),
    query(`SELECT id, user_name, user_role, action, entity, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 15`),
    query(`SELECT id, title, created_at FROM announcements WHERE status='ACTIVE' ORDER BY pinned DESC, created_at DESC LIMIT 5`),
  ]);
  const f = fees.rows[0]; const ex = expenses.rows[0];
  const stuMarked = stuAtt.rows[0]; const empMarked = empAtt.rows[0];
  const rate = (a) => (a.marked ? Math.round((a.present / a.marked) * 1000) / 10 : null);
  const allPerf = perf.rows;
  res.json({
    counts: counts.rows[0],
    enrollment: { byClass: enrol.rows, newLast7Days: newRegs.rows[0].last_7_days, newLast30Days: newRegs.rows[0].last_30_days },
    attendance: { students: { ...stuMarked, rate: rate(stuMarked) }, staff: { ...empMarked, rate: rate(empMarked) } },
    academics: { byClass: allPerf, schoolAverage: allPerf.length ? Math.round(allPerf.reduce((a, r) => a + num(r.average), 0) / allPerf.length * 10) / 10 : null },
    finance: { expected: num(f.expected), collected: num(f.collected), outstanding: num(f.outstanding), expenses: num(ex.total), expensesThisMonth: num(ex.this_month),
      net: num(f.collected) - num(ex.total), collectionRate: num(f.expected) ? Math.round((num(f.collected) / num(f.expected)) * 1000) / 10 : null,
      trend: trend.rows.map((t) => ({ month: t.month, collected: num(t.collected), expenses: num(t.expenses) })) },
    pendingApprovals: pending.rows[0],
    recentActivity: activity.rows,
    announcements: ann.rows,
    unreadNotifications: await notifications.unreadCount(req.user),
    unreadMessages: (await query('SELECT count(*)::int AS c FROM messages WHERE recipient_id=$1 AND read_at IS NULL', [req.user.uid])).rows[0].c,
  });
});

// ------------------------------------------------------------------ Drill-down: the real records behind each number
const RECORDS = {
  students: { cols: ['student_code:Admission no.', 'name:Name', 'class_name:Class', 'status:Status', 'guardian_name:Guardian', 'guardian_phone:Phone'],
    sql: `SELECT s.id, s.student_code, s.first_name || ' ' || s.last_name AS name, c.name AS class_name, s.status, s.guardian_name, s.guardian_phone FROM students s JOIN classes c ON c.id=s.class_id`, search: `(s.first_name || ' ' || s.last_name) ILIKE $1 OR s.student_code ILIKE $1`, order: 's.created_at DESC', link: '/admin/student-profile.html?id=' },
  teachers: { cols: ['employee_code:ID', 'name:Name', 'position:Position', 'phone:Phone', 'status:Status'],
    sql: `SELECT e.id, e.employee_code, e.first_name || ' ' || e.last_name AS name, p.name AS position, e.phone, e.status FROM employees e JOIN positions p ON p.id=e.position_id WHERE p.name ILIKE '%teach%'`, search: `(e.first_name || ' ' || e.last_name) ILIKE $1 OR e.employee_code ILIKE $1`, order: 'e.first_name', link: '/admin/employee-profile.html?id=' },
  employees: { cols: ['employee_code:ID', 'name:Name', 'position:Position', 'phone:Phone', 'status:Status'],
    sql: `SELECT e.id, e.employee_code, e.first_name || ' ' || e.last_name AS name, p.name AS position, e.phone, e.status FROM employees e JOIN positions p ON p.id=e.position_id`, search: `(e.first_name || ' ' || e.last_name) ILIKE $1 OR e.employee_code ILIKE $1`, order: 'e.first_name', link: '/admin/employee-profile.html?id=' },
  classes: { cols: ['name:Class', 'category:Category', 'students:Active students'],
    sql: `SELECT c.id, c.name, cat.name AS category, (SELECT count(*)::int FROM students s WHERE s.class_id=c.id AND s.status='ACTIVE') AS students FROM classes c JOIN categories cat ON cat.id=c.category_id`, search: `c.name ILIKE $1`, order: 'c.name' },
  departments: { cols: ['name:Department', 'staff:Staff'], sql: `SELECT d.id, d.name, (SELECT count(*)::int FROM employees e WHERE e.department_id=d.id) AS staff FROM departments d`, search: `d.name ILIKE $1`, order: 'd.name' },
  administrators: { cols: ['name:Name', 'role:Role', 'job_title:Title', 'email:Email', 'status:Status', 'last_login_at:Last login'],
    sql: `SELECT u.id, u.name, u.role, u.job_title, u.email, u.status, u.last_login_at FROM users u WHERE u.role::text = ANY($ARR)`, search: `u.name ILIKE $1 OR u.email ILIKE $1`, order: 'u.created_at DESC', arr: MGMT },
  parents: { cols: ['name:Name', 'email:Email', 'phone:Phone', 'status:Status'], sql: `SELECT u.id, u.name, u.email, u.phone, u.status FROM users u WHERE u.role::text = 'PARENT'`, search: `u.name ILIKE $1 OR u.email ILIKE $1`, order: 'u.created_at DESC' },
  invoices: { cols: ['invoice_number:Invoice', 'student:Student', 'total_amount:Total', 'amount_paid:Paid', 'balance:Balance', 'status:Status'],
    sql: `SELECT i.id, i.invoice_number, s.first_name || ' ' || s.last_name AS student, i.total_amount, i.amount_paid, i.balance, i.status, s.id AS student_id FROM invoices i JOIN students s ON s.id=i.student_id`, search: `(s.first_name || ' ' || s.last_name) ILIKE $1 OR i.invoice_number ILIKE $1`, order: 'i.created_at DESC', link: '/admin/student-profile.html?id=', linkField: 'student_id' },
  outstanding: { cols: ['invoice_number:Invoice', 'student:Student', 'balance:Balance', 'status:Status'],
    sql: `SELECT i.id, i.invoice_number, s.first_name || ' ' || s.last_name AS student, i.balance, i.status, s.id AS student_id FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.balance > 0`, search: `(s.first_name || ' ' || s.last_name) ILIKE $1 OR i.invoice_number ILIKE $1`, order: 'i.balance DESC', link: '/admin/student-profile.html?id=', linkField: 'student_id' },
  payments: { cols: ['receipt_number:Receipt', 'student:Student', 'amount:Amount', 'method:Method', 'status:Status', 'paid_at:Paid at', 'recorded_by_name:Recorded by'],
    sql: `SELECT p.id, p.receipt_number, s.first_name || ' ' || s.last_name AS student, p.amount, p.method, p.status, p.paid_at, u.name AS recorded_by_name FROM payments p JOIN students s ON s.id=p.student_id LEFT JOIN users u ON u.id=p.recorded_by`, search: `(s.first_name || ' ' || s.last_name) ILIKE $1 OR p.receipt_number ILIKE $1`, order: 'p.created_at DESC' },
  expenses: { cols: ['reference:Ref', 'category:Category', 'description:Description', 'amount:Amount', 'expense_date:Date', 'approval_status:Approval', 'recorded_by_name:Entered by'],
    sql: `SELECT e.id, e.reference, ec.name AS category, e.description, e.amount, e.expense_date, e.approval_status, u.name AS recorded_by_name FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id LEFT JOIN users u ON u.id=e.recorded_by`, search: `e.description ILIKE $1 OR e.reference ILIKE $1 OR ec.name ILIKE $1`, order: 'e.created_at DESC' },
  results: { cols: ['student:Student', 'class_name:Class', 'subject:Subject', 'term:Term', 'score:Score', 'status:Status', 'entered_by_name:Teacher'],
    sql: `SELECT r.id, s.first_name || ' ' || s.last_name AS student, c.name AS class_name, sub.name AS subject, r.term, r.score || '/' || r.max_score AS score, r.status, u.name AS entered_by_name, s.id AS student_id
          FROM exam_results r JOIN students s ON s.id=r.student_id JOIN classes c ON c.id=r.class_id JOIN subjects sub ON sub.id=r.subject_id LEFT JOIN users u ON u.id=r.entered_by`, search: `(s.first_name || ' ' || s.last_name) ILIKE $1 OR sub.name ILIKE $1`, order: 'r.updated_at DESC', link: '/admin/student-profile.html?id=', linkField: 'student_id' },
  attendance: { cols: ['attendance_date:Date', 'student:Student', 'class_name:Class', 'status:Status', 'marked_by_name:Marked by'],
    sql: `SELECT a.id, a.attendance_date, s.first_name || ' ' || s.last_name AS student, c.name AS class_name, a.status, u.name AS marked_by_name, s.id AS student_id FROM student_attendance a JOIN students s ON s.id=a.student_id JOIN classes c ON c.id=a.class_id LEFT JOIN users u ON u.id=a.marked_by`, search: `(s.first_name || ' ' || s.last_name) ILIKE $1 OR c.name ILIKE $1`, order: 'a.attendance_date DESC, s.first_name', link: '/admin/student-profile.html?id=', linkField: 'student_id' },
  registrations: { cols: ['registration_number:Reg. no.', 'name:Applicant', 'class_name:Class', 'status:Status', 'created_at:Submitted'],
    sql: `SELECT r.id, r.registration_number, r.first_name || ' ' || r.last_name AS name, c.name AS class_name, r.status, r.created_at FROM registrations r JOIN classes c ON c.id=r.class_id`, search: `(r.first_name || ' ' || r.last_name) ILIKE $1 OR r.registration_number ILIKE $1`, order: 'r.created_at DESC' },
  activity: { cols: ['created_at:When', 'user_name:Who', 'user_role:Role', 'action:Action', 'entity:Record'], sql: `SELECT a.id, a.created_at, a.user_name, a.user_role, a.action, a.entity FROM audit_logs a`, search: `a.user_name ILIKE $1 OR a.action ILIKE $1 OR a.entity ILIKE $1`, order: 'a.created_at DESC' },
};

const records = asyncHandler(async (req, res) => {
  const def = RECORDS[req.params.type];
  if (!def) throw new AppError(`Unknown record type. Choose one of: ${Object.keys(RECORDS).join(', ')}.`, 404);
  const params = []; let sql = def.sql; let where = def.sql.includes(' WHERE ') ? ' AND ' : ' WHERE ';
  if (def.arr) { params.push(def.arr); sql = sql.replace('$ARR', `$${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); sql += `${where}(${def.search.replace(/\$1/g, `$${params.length}`)})`; }
  const limit = Math.min(Number(req.query.limit) || 50, 200); const offset = Math.max(Number(req.query.offset) || 0, 0);
  const total = Number((await query(`SELECT count(*) FROM (${sql}) t`, params)).rows[0].count);
  params.push(limit, offset);
  const { rows } = await query(`${sql} ORDER BY ${def.order} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ type: req.params.type, columns: def.cols.map((c) => ({ key: c.split(':')[0], label: c.split(':')[1] })), rows, total, limit, offset, link: def.link || null, linkField: def.linkField || 'id' });
});

module.exports = { overview, records };
