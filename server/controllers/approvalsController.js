const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { notify } = require('../services/notificationService');
const { writeAudit } = require('../utils/auditLogger');

const listExpenses = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT e.*, ec.name AS category_name, u.name AS recorded_by_name, a.name AS approved_by_name
     FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id LEFT JOIN users u ON u.id=e.recorded_by LEFT JOIN users a ON a.id=e.approved_by
     WHERE e.approval_status = $1 ORDER BY e.created_at DESC LIMIT 500`, [req.query.status || 'PENDING']);
  res.json(rows);
});

const decideExpense = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new AppError('decision must be APPROVED or REJECTED.');
  const { rows } = await query(
    `UPDATE expenses SET approval_status=$2, approved_by=$3, approved_at=now(), approval_note=$4 WHERE id=$1 AND approval_status='PENDING' RETURNING *`,
    [req.params.id, decision, req.user.uid, note || null]);
  if (!rows[0]) throw new AppError('Pending expense not found (it may already have been decided).', 404);
  await writeAudit({ user: req.user, action: `EXPENSE_${decision}`, entity: 'expenses', entityId: rows[0].id, after: { note: note || null }, req });
  if (rows[0].recorded_by) await notify({ toUserId: rows[0].recorded_by, sender: req.user, department: 'Finance', type: decision === 'APPROVED' ? 'SUCCESS' : 'ERROR',
    title: `Expense ${decision.toLowerCase()}`, message: `${rows[0].reference} was ${decision.toLowerCase()}${note ? `: ${note}` : '.'}`, link: '/admin/expenses.html', alsoOwner: false });
  res.json(rows[0]);
});

module.exports = { listExpenses, decideExpense };
