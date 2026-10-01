const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { notify } = require('./notificationService');
const { writeAudit } = require('../utils/auditLogger');

/** Teacher/Employee/Worker submits their own leave request (from their authenticated portal). */
async function submitLeaveRequest({ employeeId, startDate, endDate, leaveType, reason }, actor) {
  if (!employeeId || !startDate || !endDate) throw new AppError('startDate and endDate are required.');
  if (new Date(endDate) < new Date(startDate)) throw new AppError('End date cannot be before the start date.');

  const { rows } = await query(
    `INSERT INTO employee_leave (employee_id, start_date, end_date, reason, leave_type, status)
     VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING *`,
    [employeeId, startDate, endDate, reason || null, leaveType || 'OTHER']
  );
  await notify({
    toRole: 'MANAGER',
    title: 'New leave request',
    message: `A leave request was submitted for ${startDate} to ${endDate}.`,
    type: 'INFO',
    link: '/admin/leave-requests.html',
  });
  await writeAudit({ user: actor, action: 'SUBMIT_LEAVE_REQUEST', entity: 'employee_leave', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

/** Manager's queue — defaults to pending requests, but any status can be viewed. */
async function listLeaveRequests({ status } = {}) {
  let sql = `
    SELECT l.*, e.first_name, e.last_name, e.employee_code, e.tracking_code, p.name AS position_name, d.name AS department_name
    FROM employee_leave l
    JOIN employees e ON e.id = l.employee_id
    LEFT JOIN positions p ON p.id = e.position_id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE 1=1`;
  const params = [];
  if (status) { params.push(status); sql += ` AND l.status = $${params.length}`; }
  sql += ' ORDER BY l.requested_at DESC LIMIT 1000';
  const { rows } = await query(sql, params);
  return rows;
}

async function listLeaveForEmployee(employeeId) {
  const { rows } = await query('SELECT * FROM employee_leave WHERE employee_id = $1 ORDER BY requested_at DESC', [employeeId]);
  return rows;
}

/** Manager approves or declines, optionally with a note the employee will see on their own page. */
async function decideLeaveRequest(leaveId, { decision, note }, actor) {
  if (!['APPROVED', 'DECLINED'].includes(decision)) throw new AppError('decision must be APPROVED or DECLINED.');

  const { rows } = await query(
    `UPDATE employee_leave SET status = $1, decision_note = $2, decided_by = $3, decided_at = now(), approved_by = $3
     WHERE id = $4 AND status = 'PENDING' RETURNING *`,
    [decision, note || null, actor.uid, leaveId]
  );
  if (!rows.length) throw new AppError('Leave request not found or already decided.', 404);

  const leave = rows[0];
  const { rows: userRows } = await query('SELECT id FROM users WHERE linked_employee_id = $1', [leave.employee_id]);
  if (userRows.length) {
    await notify({
      toUserId: userRows[0].id,
      title: `Leave request ${decision.toLowerCase()}`,
      message: note ? `Your leave request (${leave.start_date} to ${leave.end_date}) was ${decision.toLowerCase()}. Note: ${note}` : `Your leave request (${leave.start_date} to ${leave.end_date}) was ${decision.toLowerCase()}.`,
      type: decision === 'APPROVED' ? 'SUCCESS' : 'WARNING',
    });
  }
  await writeAudit({ user: actor, action: 'DECIDE_LEAVE_REQUEST', entity: 'employee_leave', entityId: leaveId, after: leave });
  return leave;
}

module.exports = { submitLeaveRequest, listLeaveRequests, listLeaveForEmployee, decideLeaveRequest };
