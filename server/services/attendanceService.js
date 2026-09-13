const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');

function today() { return new Date().toISOString().slice(0, 10); }

/**
 * Today's roster — every ACTIVE employee, LEFT JOINed against today's
 * attendance row if one exists. This is what makes a newly-added worker
 * "automatically appear" on Attendance (spec §45): there is no separate
 * enrollment step, the roster is always derived fresh from `employees`.
 */
async function getRoster(date = today()) {
  const { rows } = await query(
    `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name, p.name AS position_name,
            a.status, a.check_in_time
     FROM employees e
     LEFT JOIN positions p ON p.id = e.position_id
     LEFT JOIN employee_attendance a ON a.employee_id = e.id AND a.date = $1
     WHERE e.status = 'ACTIVE'
     ORDER BY e.first_name`,
    [date]
  );
  return rows.map((r) => ({ ...r, status: r.status || 'NOT_MARKED' }));
}

/** Employee self-check-in from their portal. Cannot mark twice (spec §48, §98). */
async function markSelfPresent(employeeId) {
  const date = today();
  const existing = await query('SELECT * FROM employee_attendance WHERE employee_id = $1 AND date = $2', [employeeId, date]);
  if (existing.rows.length && existing.rows[0].status !== 'NOT_MARKED') {
    throw new AppError('You have already marked your attendance today.');
  }

  const now = new Date();
  const cutoffRes = await query('SELECT attendance_cutoff FROM school_settings WHERE id = 1');
  const cutoff = cutoffRes.rows[0]?.attendance_cutoff || '09:00:00';
  const [ch, cm] = cutoff.split(':').map(Number);
  const isLate = now.getHours() > ch || (now.getHours() === ch && now.getMinutes() > cm);

  const { rows } = await query(
    `INSERT INTO employee_attendance (employee_id, date, status, check_in_time)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (employee_id, date) DO UPDATE SET status = $3, check_in_time = now()
     RETURNING *`,
    [employeeId, date, isLate ? 'LATE' : 'PRESENT']
  );
  return rows[0];
}

/** Manager/HR manual override for any employee/day (with audit trail — spec §98). */
async function markManual({ employeeId, date, status }, actor) {
  const allowed = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY'];
  if (!allowed.includes(status)) throw new AppError('Invalid attendance status.');
  const { rows } = await query(
    `INSERT INTO employee_attendance (employee_id, date, status, marked_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (employee_id, date) DO UPDATE SET status = $3, marked_by = $4
     RETURNING *`,
    [employeeId, date || today(), status, actor.uid]
  );
  await writeAudit({ user: actor, action: 'MARK_ATTENDANCE', entity: 'employee_attendance', entityId: rows[0].id, after: { status } });
  return rows[0];
}

/**
 * Automatic absence sweep (spec §49, §97): any ACTIVE employee with no
 * attendance row for `date` — and no approved leave covering that date —
 * gets marked ABSENT. Intended to run once daily, shortly after the
 * configured attendance_cutoff (see scripts/run-absence-sweep.js and the
 * deployment guide for scheduling it as a cron job).
 */
async function runAbsenceSweep(date = today()) {
  const { rows } = await query(
    `INSERT INTO employee_attendance (employee_id, date, status)
     SELECT e.id, $1, 'ABSENT'
     FROM employees e
     WHERE e.status = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM employee_attendance a WHERE a.employee_id = e.id AND a.date = $1)
       AND NOT EXISTS (SELECT 1 FROM employee_leave l WHERE l.employee_id = e.id AND $1::date BETWEEN l.start_date AND l.end_date)
     RETURNING employee_id`,
    [date]
  );
  return { markedAbsent: rows.length };
}

async function attendanceHistory(employeeId) {
  const { rows } = await query('SELECT * FROM employee_attendance WHERE employee_id = $1 ORDER BY date DESC LIMIT 90', [employeeId]);
  return rows;
}

async function todaySummary(date = today()) {
  const roster = await getRoster(date);
  return {
    total: roster.length,
    present: roster.filter((r) => r.status === 'PRESENT').length,
    absent: roster.filter((r) => r.status === 'ABSENT').length,
    late: roster.filter((r) => r.status === 'LATE').length,
    leave: roster.filter((r) => r.status === 'LEAVE').length,
    notMarked: roster.filter((r) => r.status === 'NOT_MARKED').length,
  };
}

module.exports = { getRoster, markSelfPresent, markManual, runAbsenceSweep, attendanceHistory, todaySummary };
