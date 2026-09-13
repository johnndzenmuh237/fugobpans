const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');

/**
 * Manager adds ANY kind of worker — teacher, cleaner, security, driver,
 * accountant, etc. (spec §42). No separate "attendance registration"
 * step exists: the moment the employee row is inserted, they exist for
 * every date's attendance query (see attendanceService.getTodayRoster),
 * which is what "automatically appears in Attendance" means in practice
 * — attendance is derived from the employees table, not a separate list.
 */
async function createEmployee(body, actor) {
  const required = ['firstName', 'lastName', 'phone', 'positionId'];
  for (const f of required) if (!body[f]) throw new AppError(`Missing required field: ${f}`);

  return withTransaction(async (client) => {
    const employeeCode = await nextId('EMP');
    const { rows } = await client.query(
      `INSERT INTO employees (
         employee_code, first_name, last_name, date_of_birth, gender, phone, whatsapp, email,
         address, emergency_contact, position_id, department_id, employment_type, start_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'ACTIVE')
       RETURNING *`,
      [
        employeeCode, body.firstName, body.lastName, body.dateOfBirth || null, body.gender || null,
        body.phone, body.whatsapp || null, body.email || null, body.address || null, body.emergencyContact || null,
        body.positionId, body.departmentId || null, body.employmentType || 'FULL_TIME', body.startDate || new Date().toISOString().slice(0, 10),
      ]
    );
    const employee = rows[0];

    if (body.basicSalary) {
      await client.query(
        `INSERT INTO salary_history (employee_id, basic_salary, allowances, deductions) VALUES ($1,$2,$3,$4)`,
        [employee.id, body.basicSalary, body.allowances || 0, body.deductions || 0]
      );
    }

    await writeAudit({ user: actor, action: 'CREATE_EMPLOYEE', entity: 'employees', entityId: employee.id, after: employee });
    return employee;
  });
}

async function createEmployeeLogin({ employeeId, email, password, role }, actor) {
  const { hashPassword } = require('./authService');
  const hash = await hashPassword(password);
  const empRes = await query('SELECT * FROM employees WHERE id = $1', [employeeId]);
  if (!empRes.rows.length) throw new AppError('Employee not found.');
  const emp = empRes.rows[0];

  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, linked_employee_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role`,
    [`${emp.first_name} ${emp.last_name}`, email, hash, role, employeeId]
  );
  await writeAudit({ user: actor, action: 'CREATE_EMPLOYEE_LOGIN', entity: 'users', entityId: rows[0].id, after: { email, role } });
  return rows[0];
}

async function listEmployees(filters = {}) {
  let sql = `SELECT e.*, p.name AS position_name, d.name AS department_name FROM employees e
             LEFT JOIN positions p ON p.id = e.position_id LEFT JOIN departments d ON d.id = e.department_id WHERE 1=1`;
  const params = [];
  if (filters.positionId) { params.push(filters.positionId); sql += ` AND e.position_id = $${params.length}`; }
  if (filters.status) { params.push(filters.status); sql += ` AND e.status = $${params.length}`; }
  sql += ' ORDER BY e.created_at DESC';
  const { rows } = await query(sql, params);
  return rows;
}

async function getEmployeeProfile(id) {
  const { rows } = await query(
    `SELECT e.*, p.name AS position_name, d.name AS department_name FROM employees e
     LEFT JOIN positions p ON p.id = e.position_id LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = $1`,
    [id]
  );
  if (!rows.length) throw new AppError('Employee not found.', 404);

  const salary = await query('SELECT * FROM salary_history WHERE employee_id = $1 ORDER BY effective_date DESC', [id]);
  const attendance = await query(
    `SELECT status, COUNT(*) FROM employee_attendance WHERE employee_id = $1 GROUP BY status`, [id]
  );
  return { ...rows[0], salaryHistory: salary.rows, attendanceSummary: attendance.rows };
}

module.exports = { createEmployee, createEmployeeLogin, listEmployees, getEmployeeProfile };
