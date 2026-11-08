const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { notify } = require('../services/notificationService');
const { ROLES, MANAGEMENT_ROLES, isManagementLevel } = require('../middleware/roles');
const { teacherClassIds, parentStudentIds } = require('../utils/access');

const MGMT = [ROLES.OWNER, ROLES.MANAGER, ...MANAGEMENT_ROLES];
const COLS = 'u.id, u.name, u.role, u.job_title';

/** Who a person is allowed to write to. The same list validates sends, so it cannot be bypassed. */
async function contactsFor(user) {
  let rows;
  if (isManagementLevel(user)) {
    rows = (await query(`SELECT ${COLS} FROM users u WHERE u.status='ACTIVE' AND u.id <> $1 ORDER BY u.name LIMIT 1000`, [user.uid])).rows;
  } else if (user.role === ROLES.TEACHER) {
    const classes = await teacherClassIds(user);
    rows = (await query(
      `SELECT ${COLS} FROM users u WHERE u.status='ACTIVE' AND u.id <> $1 AND (
         u.role::text = ANY($2)
         OR u.linked_student_id IN (SELECT id FROM students WHERE class_id = ANY($3::uuid[]))
         OR u.id IN (SELECT ps.parent_user_id FROM parent_students ps JOIN students s ON s.id=ps.student_id WHERE s.class_id = ANY($3::uuid[]))
       ) ORDER BY u.name LIMIT 1000`, [user.uid, MGMT, classes])).rows;
  } else if (user.role === ROLES.PARENT) {
    const kids = await parentStudentIds(user);
    rows = (await query(
      `SELECT ${COLS} FROM users u WHERE u.status='ACTIVE' AND (
         u.role::text = ANY($1)
         OR u.role::text = 'ACCOUNTANT'
         OR u.linked_employee_id IN (SELECT c.class_teacher_id FROM classes c JOIN students s ON s.class_id=c.id WHERE s.id = ANY($2::uuid[]))
         OR u.linked_employee_id IN (SELECT cs.teacher_id FROM class_subjects cs JOIN students s ON s.class_id=cs.class_id WHERE s.id = ANY($2::uuid[]))
       ) ORDER BY u.name LIMIT 1000`, [MGMT.filter((r) => r !== ROLES.OWNER), kids])).rows;
  } else if (user.role === ROLES.STUDENT) {
    rows = (await query(
      `SELECT ${COLS} FROM users u WHERE u.status='ACTIVE' AND (
         u.linked_employee_id IN (SELECT c.class_teacher_id FROM classes c JOIN students s ON s.class_id=c.id WHERE s.id = $1)
         OR u.linked_employee_id IN (SELECT cs.teacher_id FROM class_subjects cs JOIN students s ON s.class_id=cs.class_id WHERE s.id = $1)
       ) ORDER BY u.name`, [user.linkedStudentId])).rows;
  } else {
    // accountant / employee: management (and parents for the accountant, regarding fees)
    rows = (await query(`SELECT ${COLS} FROM users u WHERE u.status='ACTIVE' AND u.id <> $1 AND (u.role::text = ANY($2) ${user.role === ROLES.ACCOUNTANT ? "OR u.role::text = 'PARENT'" : ''}) ORDER BY u.name LIMIT 1000`, [user.uid, MGMT])).rows;
  }
  return rows;
}

const contacts = asyncHandler(async (req, res) => res.json(await contactsFor(req.user)));

const send = asyncHandler(async (req, res) => {
  const { recipientId, subject, body, studentId } = req.body;
  if (!recipientId || !subject || !body) throw new AppError('recipientId, subject and body are required.');
  if (String(body).length > 5000) throw new AppError('Message is too long.');
  const allowed = await contactsFor(req.user);
  const to = allowed.find((c) => c.id === recipientId);
  if (!to) throw new AppError('You are not permitted to message that person.', 403);
  const { rows } = await query(
    `INSERT INTO messages (sender_id, sender_name, sender_role, recipient_id, subject, body, student_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [req.user.uid, req.user.name, req.user.role, recipientId, String(subject).slice(0, 150), body, studentId || null]);
  await notify({ toUserId: recipientId, sender: req.user, department: null, type: 'INFO', title: `New message from ${req.user.name}`,
    message: String(subject).slice(0, 200), link: '/messages.html', entity: 'messages', entityId: rows[0].id, alsoOwner: false });
  res.status(201).json(rows[0]);
});

const list = asyncHandler(async (req, res) => {
  const sent = req.query.box === 'sent';
  const { rows } = await query(
    `SELECT m.id, m.subject, m.body, m.sender_name, m.sender_role, m.created_at, m.read_at, m.student_id, m.recipient_id, r.name AS recipient_name
     FROM messages m JOIN users r ON r.id = m.recipient_id WHERE ${sent ? 'm.sender_id' : 'm.recipient_id'} = $1 ORDER BY m.created_at DESC LIMIT 200`, [req.user.uid]);
  res.json(rows);
});
const unread = asyncHandler(async (req, res) => res.json({ count: (await query('SELECT count(*)::int AS c FROM messages WHERE recipient_id=$1 AND read_at IS NULL', [req.user.uid])).rows[0].c }));
const markRead = asyncHandler(async (req, res) => { await query('UPDATE messages SET read_at = COALESCE(read_at, now()) WHERE id=$1 AND recipient_id=$2', [req.params.id, req.user.uid]); res.json({ ok: true }); });

module.exports = { contacts, send, list, unread, markRead };
