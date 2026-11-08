const { query } = require('../config/db');
const { notify } = require('./notificationService');

const fmt = (n) => Number(n).toLocaleString();

/** After a payment is recorded: tell finance/management, and the student's own login + parents their new balance. */
async function notifyPaymentRecorded({ payment, invoice, actor = null }) {
  try {
    const st = (await query('SELECT id, first_name, last_name FROM students WHERE id = $1', [invoice.student_id])).rows[0];
    if (!st) return;
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid);
    const name = `${st.first_name} ${st.last_name}`;
    await notify({ toRoles: ['MANAGER', 'ACCOUNTANT'], sender: actor, department: 'Finance', type: 'SUCCESS', title: 'Payment recorded',
      message: `${fmt(payment.amount)} FCFA received for ${name} (receipt ${payment.receipt_number}). Balance: ${fmt(balance)} FCFA.`,
      link: `/admin/student-profile.html?id=${st.id}`, entity: 'payments', entityId: payment.id });
    const { rows } = await query(
      `SELECT id FROM users WHERE linked_student_id = $1 AND status='ACTIVE'
       UNION SELECT ps.parent_user_id FROM parent_students ps JOIN users u ON u.id=ps.parent_user_id WHERE ps.student_id=$1 AND u.status='ACTIVE'`, [st.id]);
    await notify({ toUserIds: rows.map((r) => r.id), sender: actor, department: 'Finance', type: 'INFO', alsoOwner: false,
      title: 'Payment received — fee balance updated',
      message: `${fmt(payment.amount)} FCFA was recorded for ${name}. Receipt ${payment.receipt_number}. Outstanding balance: ${fmt(balance)} FCFA.`,
      link: '/parent/dashboard.html#fees', entity: 'payments', entityId: payment.id });
  } catch (e) { console.error('[feeNotifier]', e.message); }
}
module.exports = { notifyPaymentRecorded };
