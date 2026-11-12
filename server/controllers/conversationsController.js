/**
 * Private threaded conversations.
 *   STAFF_MANAGEMENT  a staff member (TEACHER / EMPLOYEE / ACCOUNTANT) <-> the management team
 *   MANAGER_OWNER     a manager (MANAGER / Principal / Vice Principal / Administrator / Academic Admin) <-> the Owner
 * Access is decided here on every request (never by the client):
 *   - the participant (the staff member / the manager who started the thread) can read and write only their own threads;
 *   - STAFF_MANAGEMENT threads are visible to the Owner, the legacy Manager and management posts holding the "teachers"
 *     permission (the same permission that already protects the staff list);
 *   - MANAGER_OWNER threads are visible only to the manager who owns the thread and the Owner. Other managers cannot see them.
 */
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { notify } = require('../services/notificationService');
const { ROLES, MANAGEMENT_ROLES } = require('../middleware/roles');

const STAFF = [ROLES.TEACHER, ROLES.EMPLOYEE, ROLES.ACCOUNTANT];
const MANAGERS = [ROLES.MANAGER, ...MANAGEMENT_ROLES];
const CHANNELS = ['STAFF_MANAGEMENT', 'MANAGER_OWNER'];
const CATEGORIES = ['MESSAGE', 'REQUEST', 'QUESTION', 'COMPLAINT'];
const CATEGORY_LABEL = { MESSAGE: 'Message', REQUEST: 'Request', QUESTION: 'Question', COMPLAINT: 'Complaint' };

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

/** Owner, legacy Manager, or a management post that was granted the "teachers" permission. */
function canHandleStaff(u) {
  return u.role === ROLES.OWNER || u.role === ROLES.MANAGER || (MANAGEMENT_ROLES.includes(u.role) && u.permissions?.teachers === true);
}
/** Which side of a channel is this person on? 'participant' | 'responder' | null */
function sideFor(user, c) {
  if (c.participant_id === user.uid) return 'participant';
  if (c.channel === 'STAFF_MANAGEMENT' && canHandleStaff(user)) return 'responder';
  if (c.channel === 'MANAGER_OWNER' && user.role === ROLES.OWNER) return 'responder';
  return null;
}
function canStart(user, channel) {
  if (channel === 'STAFF_MANAGEMENT') return STAFF.includes(user.role);
  if (channel === 'MANAGER_OWNER') return MANAGERS.includes(user.role);
  return false;
}
function canRespond(user, channel) {
  return channel === 'STAFF_MANAGEMENT' ? canHandleStaff(user) : user.role === ROLES.OWNER;
}

/** Everyone who should be told about a new message from the participant. */
async function responders(channel, exceptId) {
  if (channel === 'MANAGER_OWNER') {
    return (await query(`SELECT id FROM users WHERE status='ACTIVE' AND role = 'OWNER' AND id <> $1`, [exceptId])).rows.map((r) => r.id);
  }
  return (await query(
    `SELECT id FROM users WHERE status='ACTIVE' AND id <> $1 AND (role::text IN ('OWNER','MANAGER') OR (role::text = ANY($2) AND (permissions->>'teachers') = 'true'))`,
    [exceptId, MANAGEMENT_ROLES])).rows.map((r) => r.id);
}

// "Unread" for viewer V in conversation C: a message newer than V's last read that came from the OTHER side.
const UNREAD_SQL = `EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id = c.id
    AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
    AND ((c.participant_id = $1 AND m.sender_id <> c.participant_id) OR (c.participant_id <> $1 AND m.sender_id = c.participant_id)))`;

const LIST_COLS = `c.id, c.channel, c.subject, c.category, c.status, c.last_message_at, c.created_at, c.participant_id,
  pu.name AS participant_name, pu.role AS participant_role, COALESCE(pu.job_title, pos.name) AS participant_title, e.employee_code,
  ${UNREAD_SQL} AS unread,
  (SELECT left(m.body, 140) FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
  (SELECT count(*)::int FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count`;
const LIST_FROM = `FROM conversations c JOIN users pu ON pu.id = c.participant_id
  LEFT JOIN employees e ON e.id = pu.linked_employee_id LEFT JOIN positions pos ON pos.id = e.position_id
  LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = $1`;

function channelParam(req) {
  const ch = String(req.query.channel || '').toUpperCase();
  if (!CHANNELS.includes(ch)) throw new AppError('channel must be STAFF_MANAGEMENT or MANAGER_OWNER.');
  return ch;
}

/** The person's own threads on a channel (staff -> management, or manager -> owner). */
const mine = asyncHandler(async (req, res) => {
  const channel = channelParam(req);
  if (!canStart(req.user, channel)) throw new AppError('Your account cannot use this channel.', 403);
  const { rows } = await query(`SELECT ${LIST_COLS} ${LIST_FROM} WHERE c.channel = $2 AND c.participant_id = $1 ORDER BY c.last_message_at DESC LIMIT 200`, [req.user.uid, channel]);
  res.json(rows);
});

/** Everyone's threads that this person is allowed to answer (managers: staff messages; owner: manager messages). */
const inbox = asyncHandler(async (req, res) => {
  const channel = channelParam(req);
  if (!canRespond(req.user, channel)) throw new AppError('You do not have access to this inbox.', 403);
  const { rows } = await query(
    `SELECT ${LIST_COLS} ${LIST_FROM} WHERE c.channel = $2 AND c.participant_id <> $1 ORDER BY c.last_message_at DESC LIMIT 500`, [req.user.uid, channel]);
  res.json(rows);
});

const unreadCounts = asyncHandler(async (req, res) => {
  const u = req.user;
  const out = { staffInbox: 0, ownerInbox: 0, mine: 0 };
  const count = async (where, params) => (await query(`SELECT count(*)::int AS n ${LIST_FROM} WHERE ${where} AND ${UNREAD_SQL}`, [u.uid, ...params])).rows[0].n;
  if (canHandleStaff(u)) out.staffInbox = await count(`c.channel = 'STAFF_MANAGEMENT' AND c.participant_id <> $1`, []);
  if (u.role === ROLES.OWNER) out.ownerInbox = await count(`c.channel = 'MANAGER_OWNER' AND c.participant_id <> $1`, []);
  out.mine = await count(`c.participant_id = $1`, []);
  res.json(out);
});

async function load(req) {
  const { rows } = await query(
    `SELECT c.*, pu.name AS participant_name, pu.role AS participant_role, COALESCE(pu.job_title, pos.name) AS participant_title, e.employee_code
     FROM conversations c JOIN users pu ON pu.id = c.participant_id
     LEFT JOIN employees e ON e.id = pu.linked_employee_id LEFT JOIN positions pos ON pos.id = e.position_id
     WHERE c.id = $1`, [req.params.id]);
  const c = rows[0];
  // Same answer for "does not exist" and "not yours" so ids cannot be probed.
  if (!c || !sideFor(req.user, c)) throw new AppError('Conversation not found.', 404);
  return { c, side: sideFor(req.user, c) };
}

const get = asyncHandler(async (req, res) => {
  const { c, side } = await load(req);
  const { rows: messages } = await query(
    'SELECT id, sender_id, sender_name, sender_role, body, created_at FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 1000', [c.id]);
  await query(`INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES ($1,$2,now())
               ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now()`, [c.id, req.user.uid]);
  res.json({ ...c, side, messages });
});

const create = asyncHandler(async (req, res) => {
  const channel = String(req.body.channel || '').toUpperCase();
  if (!CHANNELS.includes(channel)) throw new AppError('Unknown channel.');
  if (!canStart(req.user, channel)) throw new AppError('Your account cannot start this kind of conversation.', 403);
  const subject = clean(req.body.subject, 150);
  const body = clean(req.body.body, 5000);
  const category = CATEGORIES.includes(String(req.body.category).toUpperCase()) ? String(req.body.category).toUpperCase() : 'MESSAGE';
  if (!subject) throw new AppError('Please add a subject.');
  if (!body) throw new AppError('Please write a message.');
  const conv = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO conversations (channel, participant_id, subject, category) VALUES ($1,$2,$3,$4) RETURNING id, created_at`, [channel, req.user.uid, subject, category]);
    await client.query(`INSERT INTO conversation_messages (conversation_id, sender_id, sender_name, sender_role, body) VALUES ($1,$2,$3,$4,$5)`,
      [rows[0].id, req.user.uid, req.user.name, req.user.role, body]);
    await client.query(`INSERT INTO conversation_reads (conversation_id, user_id) VALUES ($1,$2)`, [rows[0].id, req.user.uid]);
    return rows[0];
  });
  await tellResponders(req.user, channel, conv.id, `${CATEGORY_LABEL[category]}: ${subject}`, body);
  res.status(201).json({ id: conv.id });
});

async function tellResponders(user, channel, id, title, body) {
  const to = await responders(channel, user.uid);
  const page = channel === 'MANAGER_OWNER' ? 'owner' : 'staff';
  await notify({ toUserIds: to, sender: user, department: channel === 'MANAGER_OWNER' ? 'Management' : 'Staff', type: 'INFO', title: `${user.name}: ${title}`.slice(0, 150),
    message: body.slice(0, 200), link: `/communication.html?channel=${page}&c=${id}`, entity: 'conversation', entityId: id, alsoOwner: false, pushKind: 'message' });
}

const reply = asyncHandler(async (req, res) => {
  const { c, side } = await load(req);
  const body = clean(req.body.body, 5000);
  if (!body) throw new AppError('Please write a message.');
  if (c.status === 'CLOSED' && side === 'responder') throw new AppError('This conversation is closed. Re-open it to reply.', 409);
  await withTransaction(async (client) => {
    await client.query(`INSERT INTO conversation_messages (conversation_id, sender_id, sender_name, sender_role, body) VALUES ($1,$2,$3,$4,$5)`,
      [c.id, req.user.uid, req.user.name, req.user.role, body]);
    // A new message from the participant re-opens a closed thread.
    await client.query(`UPDATE conversations SET last_message_at = now(), status = CASE WHEN $2 THEN 'OPEN' ELSE status END WHERE id = $1`, [c.id, side === 'participant']);
    await client.query(`INSERT INTO conversation_reads (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now()`, [c.id, req.user.uid]);
  });
  if (side === 'participant') {
    await tellResponders(req.user, c.channel, c.id, `Re: ${c.subject}`, body);
  } else {
    const who = c.channel === 'MANAGER_OWNER' ? 'The School Owner' : req.user.name;
    await notify({ toUserId: c.participant_id, sender: req.user, department: c.channel === 'MANAGER_OWNER' ? 'Management' : 'Staff', type: 'INFO',
      title: `${who} replied: ${c.subject}`.slice(0, 150), message: body.slice(0, 200),
      link: `/communication.html?channel=${c.channel === 'MANAGER_OWNER' ? 'owner' : 'staff'}&c=${c.id}`, entity: 'conversation', entityId: c.id, alsoOwner: false, pushKind: 'message' });
  }
  res.status(201).json({ ok: true });
});

const setStatus = asyncHandler(async (req, res) => {
  const { c, side } = await load(req);
  if (side !== 'responder') throw new AppError('Only the receiving side can close or re-open a conversation.', 403);
  const status = String(req.body.status).toUpperCase();
  if (!['OPEN', 'CLOSED'].includes(status)) throw new AppError('status must be OPEN or CLOSED.');
  await query('UPDATE conversations SET status = $2 WHERE id = $1', [c.id, status]);
  res.json({ ok: true, status });
});

module.exports = { mine, inbox, unreadCounts, get, create, reply, setStatus, canHandleStaff, STAFF, MANAGERS };
