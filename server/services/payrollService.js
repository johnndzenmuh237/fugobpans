const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { computeNetSalary } = require('../utils/calculations');
const { writeAudit } = require('../utils/auditLogger');

async function updateSalary({ employeeId, basicSalary, allowances = 0, bonuses = 0, deductions = 0, effectiveDate }, actor) {
  if (!employeeId || basicSalary === undefined) throw new AppError('employeeId and basicSalary are required.');
  const { rows } = await query(
    `INSERT INTO salary_history (employee_id, basic_salary, allowances, bonuses, deductions, effective_date)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [employeeId, basicSalary, allowances, bonuses, deductions, effectiveDate || new Date().toISOString().slice(0, 10)]
  );
  await writeAudit({ user: actor, action: 'UPDATE_SALARY', entity: 'salary_history', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

async function currentSalary(employeeId) {
  const { rows } = await query('SELECT * FROM salary_history WHERE employee_id = $1 ORDER BY effective_date DESC LIMIT 1', [employeeId]);
  return rows[0] || null;
}

async function generatePayroll({ period }, actor) {
  if (!period) throw new AppError('period is required, e.g. "2026-09".');
  const existing = await query('SELECT id FROM payroll_runs WHERE period = $1', [period]);
  if (existing.rows.length) throw new AppError(`Payroll for ${period} has already been generated.`);

  return withTransaction(async (client) => {
    const { rows: run } = await client.query('INSERT INTO payroll_runs (period, generated_by) VALUES ($1,$2) RETURNING *', [period, actor.uid]);
    const employees = await client.query("SELECT id FROM employees WHERE status = 'ACTIVE'");

    let totalNet = 0;
    let count = 0;
    for (const emp of employees.rows) {
      const salRes = await client.query('SELECT * FROM salary_history WHERE employee_id = $1 ORDER BY effective_date DESC LIMIT 1', [emp.id]);
      if (!salRes.rows.length) continue;
      const sal = salRes.rows[0];
      const net = computeNetSalary({ basicSalary: sal.basic_salary, allowances: sal.allowances, bonuses: sal.bonuses, deductions: sal.deductions });
      await client.query(
        `INSERT INTO payroll_items (payroll_run_id, employee_id, basic_salary, allowances, deductions, net_salary)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [run[0].id, emp.id, sal.basic_salary, sal.allowances, sal.deductions, net]
      );
      totalNet += Number(net);
      count += 1;
    }
    await client.query('UPDATE payroll_runs SET total_net = $1, employee_count = $2 WHERE id = $3', [totalNet, count, run[0].id]);
    await writeAudit({ user: actor, action: 'GENERATE_PAYROLL', entity: 'payroll_runs', entityId: run[0].id, after: { period, totalNet, count } });
    return { ...run[0], total_net: totalNet, employee_count: count };
  });
}

/**
 * Pay a payroll item, in full or in part (spec: salary debts must support
 * partial payment, updating the remaining balance and flipping the status
 * to PAID only once the full net salary has been covered).
 */
async function markPayrollItemPaid(itemId, actor, amount) {
  const { rows: existingRows } = await query('SELECT * FROM payroll_items WHERE id = $1', [itemId]);
  const item = existingRows[0];
  if (!item) throw new AppError('Salary record not found.', 404);

  const already = Number(item.amount_paid || 0);
  const net = Number(item.net_salary);
  const payment = amount === undefined || amount === null ? net - already : Number(amount);
  if (!(payment > 0)) throw new AppError('Payment amount must be greater than zero.');
  if (already + payment > net + 0.01) throw new AppError('Payment exceeds the remaining salary balance.');

  const newPaid = Math.min(already + payment, net);
  const status = newPaid >= net ? 'PAID' : 'PARTIALLY_PAID';
  const { rows } = await query(
    `UPDATE payroll_items SET amount_paid = $1, status = $2, paid_at = CASE WHEN $2 = 'PAID' THEN now() ELSE paid_at END WHERE id = $3 RETURNING *`,
    [newPaid, status, itemId]
  );
  await writeAudit({ user: actor, action: 'PAY_PAYROLL_ITEM', entity: 'payroll_items', entityId: itemId, after: { amount: payment, newPaid, status } });
  return rows[0];
}

/** All unpaid/partially-paid salaries across every payroll run (spec §20: shown on the Debt page). */
async function listUnpaidSalaries() {
  const { rows } = await query(`
    SELECT pi.id, pi.net_salary, pi.amount_paid, (pi.net_salary - pi.amount_paid) AS balance,
           pi.status, pi.due_date, pi.paid_at, pi.created_at,
           pr.period, e.id AS employee_id, e.employee_code, e.first_name, e.last_name,
           d.name AS department_name
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
    JOIN employees e ON e.id = pi.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE pi.status != 'PAID'
    ORDER BY pr.period DESC, e.last_name
  `);
  return rows;
}

async function listPayrollRuns() {
  const { rows } = await query('SELECT * FROM payroll_runs ORDER BY created_at DESC');
  return rows;
}
async function listPayrollItems(runId) {
  const { rows } = await query(
    `SELECT pi.*, e.first_name, e.last_name, e.employee_code FROM payroll_items pi
     JOIN employees e ON e.id = pi.employee_id WHERE pi.payroll_run_id = $1`,
    [runId]
  );
  return rows;
}

module.exports = { updateSalary, currentSalary, generatePayroll, markPayrollItemPaid, listPayrollRuns, listPayrollItems, listUnpaidSalaries };
