const { query } = require('../config/db');

/** Business Management summary cards (spec §26): income, expenses, profit/loss, debts, sales, stock — all live. */
async function businessSummary() {
  const [todayIncome, todayExpense, monthIncome, monthExpense, monthSales, salesTotal, stock, debts, salaries] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='SUCCESSFUL' AND paid_at::date = CURRENT_DATE`),
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date = CURRENT_DATE`),
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='SUCCESSFUL' AND paid_at >= date_trunc('month', now())`),
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date >= date_trunc('month', now())`),
    query(`SELECT COALESCE(SUM(amount_paid),0) AS total FROM sales WHERE sale_date >= date_trunc('month', now())`),
    query(`SELECT COALESCE(SUM(amount_paid),0) AS total, COUNT(*) AS count FROM sales`),
    query(`SELECT COALESCE(SUM(quantity_on_hand * purchase_price),0) AS value, COUNT(*) FILTER (WHERE quantity_on_hand <= minimum_stock) AS low_stock FROM products WHERE status='ACTIVE'`),
    query(`SELECT COALESCE(SUM(total_amount - amount_paid),0) AS total FROM debts WHERE amount_paid < total_amount`),
    query(`SELECT COALESCE(SUM(net_salary - amount_paid),0) AS total FROM payroll_items WHERE status != 'PAID'`),
  ]);
  const todayIn = Number(todayIncome.rows[0].total);
  const todayOut = Number(todayExpense.rows[0].total);
  const monthIn = Number(monthIncome.rows[0].total) + Number(monthSales.rows[0].total);
  const monthOut = Number(monthExpense.rows[0].total);
  return {
    todayIncome: todayIn,
    todayExpenses: todayOut,
    todayProfitLoss: todayIn - todayOut,
    monthlyIncome: monthIn,
    monthlyExpenses: monthOut,
    monthlyProfitLoss: monthIn - monthOut,
    totalSales: Number(salesTotal.rows[0].total),
    salesCount: Number(salesTotal.rows[0].count),
    stockValue: Number(stock.rows[0].value),
    lowStockItems: Number(stock.rows[0].low_stock),
    outstandingDebts: Number(debts.rows[0].total),
    outstandingSalaries: Number(salaries.rows[0].total),
  };
}

/** Top-of-dashboard cards (spec §32). Every number is a live query — nothing cached/hard-coded. */
async function overview() {
  const [students, finance, employees, attToday, payrollMonth] = await Promise.all([
    query(`SELECT
             COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
             COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS today,
             COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now())) AS this_week,
             COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS this_month
           FROM students`),
    query(`SELECT
             COALESCE(SUM(total_amount),0) AS expected,
             COALESCE(SUM(amount_paid),0) AS collected,
             COALESCE(SUM(balance),0) AS outstanding,
             COUNT(*) FILTER (WHERE status = 'FULLY_PAID' OR status = 'OVERPAID') AS fully_paid,
             COUNT(*) FILTER (WHERE status = 'PARTIALLY_PAID') AS partially_paid,
             COUNT(*) FILTER (WHERE status = 'UNPAID') AS unpaid
           FROM invoices`),
    query(`SELECT COUNT(*) FILTER (WHERE status='ACTIVE') AS total FROM employees`),
    query(`SELECT
             COUNT(*) FILTER (WHERE status='PRESENT') AS present,
             COUNT(*) FILTER (WHERE status='ABSENT') AS absent,
             COUNT(*) FILTER (WHERE status='LATE') AS late
           FROM employee_attendance WHERE date = CURRENT_DATE`),
    query(`SELECT COALESCE(SUM(total_net),0) AS total FROM payroll_runs WHERE period = to_char(now(),'YYYY-MM')`),
  ]);
  const business = await businessSummary();

  return {
    students: students.rows[0],
    finance: finance.rows[0],
    employees: employees.rows[0],
    attendanceToday: attToday.rows[0],
    payrollThisMonth: payrollMonth.rows[0].total,
    business,
  };
}

/** "Who registered for what?" table (spec §33). */
async function registrationsOverview(filters = {}) {
  let sql = `
    SELECT s.id AS student_id, s.first_name, s.last_name, s.student_code, s.created_at,
           c.name AS class_name, cat.name AS category_name,
           i.invoice_number, i.total_amount, i.amount_paid, i.balance, i.status AS payment_status
    FROM students s
    JOIN classes c ON c.id = s.class_id
    JOIN categories cat ON cat.id = c.category_id
    LEFT JOIN invoices i ON i.student_id = s.id
    WHERE 1=1`;
  const params = [];
  if (filters.categoryId) { params.push(filters.categoryId); sql += ` AND cat.id = $${params.length}`; }
  if (filters.classId) { params.push(filters.classId); sql += ` AND c.id = $${params.length}`; }
  if (filters.paymentStatus) { params.push(filters.paymentStatus); sql += ` AND i.status = $${params.length}`; }
  sql += ' ORDER BY s.created_at DESC LIMIT 1000';
  const { rows } = await query(sql, params);
  return rows;
}

/** Category -> class breakdown with financial totals (spec §35, §36, §84, §85). */
async function categoryBreakdown() {
  const { rows } = await query(`
    SELECT cat.id AS category_id, cat.name AS category_name,
           c.id AS class_id, c.name AS class_name,
           COUNT(DISTINCT s.id) AS student_count,
           COALESCE(SUM(i.total_amount),0) AS expected,
           COALESCE(SUM(i.amount_paid),0) AS paid,
           COALESCE(SUM(i.balance),0) AS outstanding
    FROM categories cat
    LEFT JOIN classes c ON c.category_id = cat.id
    LEFT JOIN students s ON s.class_id = c.id AND s.status = 'ACTIVE'
    LEFT JOIN invoices i ON i.student_id = s.id
    GROUP BY cat.id, cat.name, c.id, c.name
    ORDER BY cat.display_order, c.name
  `);
  return rows;
}

module.exports = { overview, registrationsOverview, categoryBreakdown, businessSummary };
