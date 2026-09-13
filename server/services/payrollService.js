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

async function markPayrollItemPaid(itemId, actor) {
  const { rows } = await query("UPDATE payroll_items SET status = 'PAID', paid_at = now() WHERE id = $1 RETURNING *", [itemId]);
  await writeAudit({ user: actor, action: 'PAY_PAYROLL_ITEM', entity: 'payroll_items', entityId: itemId });
  return rows[0];
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

module.exports = { updateSalary, currentSalary, generatePayroll, markPayrollItemPaid, listPayrollRuns, listPayrollItems };
