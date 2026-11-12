/**
 * End-to-end API checks for: salary, staff<->management and manager<->owner conversations, notifications, web push.
 * Run against a THROWAWAY database only (it creates users). Needs the server running with VAPID_* set and
 * NODE_TLS_REJECT_UNAUTHORIZED=0 (the mock push service uses a self-signed certificate).
 *   BASE=http://localhost:4100 DATABASE_URL=... node scripts/e2e-communication.js
 */
require('dotenv').config();
const https = require('https');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const { query, pool } = require('../server/config/db');
const { hashPassword } = require('../server/services/authService');

const BASE = process.env.BASE || 'http://localhost:4100';
let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const res = await fetch(`${BASE}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let data = null; try { data = await res.json(); } catch { /* none */ }
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); } post(p, b) { return this.req('POST', p, b || {}); } patch(p, b) { return this.req('PATCH', p, b || {}); } put(p, b) { return this.req('PUT', p, b || {}); }
}
async function loginAs(email) { const c = new Client(); const r = await c.post('/auth/login', { email, password: 'Passw0rd!x' }); if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`); return c; }
async function mkUser(name, email, role, extra = {}) {
  const h = await hashPassword('Passw0rd!x');
  const { rows } = await query(`INSERT INTO users (name,email,password_hash,role,must_change_password,permissions,linked_employee_id) VALUES ($1,$2,$3,$4,false,$5,$6) RETURNING id`,
    [name, email, h, role, JSON.stringify(extra.permissions || {}), extra.employeeId || null]);
  return rows[0].id;
}

// ---- mock push service (HTTPS, self-signed) that decrypts like a real browser would ----
function startPushService(port) {
  fs.mkdirSync('/tmp/claude-0/cert', { recursive: true });
  execSync('openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/claude-0/cert/k.pem -out /tmp/claude-0/cert/c.pem -days 2 -subj /CN=localhost 2>/dev/null');
  const received = [];
  const srv = https.createServer({ key: fs.readFileSync('/tmp/claude-0/cert/k.pem'), cert: fs.readFileSync('/tmp/claude-0/cert/c.pem') }, (req, res) => {
    const chunks = []; req.on('data', (d) => chunks.push(d)); req.on('end', () => {
      const id = req.url.split('/').pop();
      received.push({ id, headers: req.headers, body: Buffer.concat(chunks) });
      if (id.startsWith('gone')) { res.statusCode = 410; return res.end(); }
      res.statusCode = 201; res.end();
    });
  });
  return new Promise((r) => srv.listen(port, () => r({ srv, received })));
}
function decryptAes128gcm(body, ua) { // RFC 8188/8291 receiver side
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
  const shared = ua.ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, ua.auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.ecdh.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString();
}
function verifyVapid(authHeader, pubB64u) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authHeader || ''); if (!m || m[2] !== pubB64u) return false;
  const [h, b, s] = m[1].split('.'); const pub = Buffer.from(pubB64u, 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  return crypto.verify('sha256', Buffer.from(`${h}.${b}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')) && JSON.parse(Buffer.from(b, 'base64url')).exp > Date.now() / 1000;
}
const newSub = (id) => { const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys(); const auth = crypto.randomBytes(16); return { ecdh, auth, json: { endpoint: `https://localhost:4443/push/${id}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tag = Date.now().toString(36);
  const em = (n) => `${n}.${tag}@test.local`;
  const hadOwner = (await query(`SELECT 1 FROM users WHERE role::text='OWNER'`)).rows.length;
  if (!hadOwner) await mkUser('Owner Test', em('owner'), 'OWNER');
  const ownerEmail = hadOwner ? (await query(`SELECT email FROM users WHERE role::text='OWNER' LIMIT 1`)).rows[0].email : em('owner');
  if (hadOwner) await query('UPDATE users SET password_hash=$1, must_change_password=false WHERE email=$2', [await hashPassword('Passw0rd!x'), ownerEmail]);
  await mkUser('Mgr Legacy', em('manager'), 'MANAGER');
  await mkUser('Pat Principal', em('principal'), 'PRINCIPAL', { permissions: { teachers: true, finance: true, announcements: true } });
  await mkUser('Vic Vice', em('vice'), 'VICE_PRINCIPAL', { permissions: { students: true } }); // no teachers/announcements permission

  console.log('\n[1] Salary on staff registration');
  const mgr = await loginAs(em('manager'));
  const pos = (await mgr.post('/employees/meta/positions', { name: `Teacher ${tag}`, defaultSalary: 55000 })).data;
  const base = { firstName: 'Ann', lastName: 'Alpha', phone: '670000001', positionId: pos.id };
  ok((await mgr.post('/employees', base)).status === 400, 'registration without salary is rejected');
  ok((await mgr.post('/employees', { ...base, basicSalary: -5 })).status === 400, 'negative salary rejected');
  ok((await mgr.post('/employees', { ...base, basicSalary: 'abc' })).status === 400, 'non-numeric salary rejected');
  const a = await mgr.post('/employees', { ...base, basicSalary: 75000 });
  ok(a.status === 201, 'registration with salary accepted');
  const b = await mgr.post('/employees', { ...base, firstName: 'Ben', lastName: 'Beta', phone: '670000002', basicSalary: 0 });
  ok(b.status === 201, 'salary 0 accepted (volunteer)');
  const legacy = (await query(`INSERT INTO employees (employee_code, first_name,last_name,phone,position_id) VALUES ($1,'Old','Timer','670000003',$2) RETURNING id`, [`EMP-L-${tag}`, pos.id])).rows[0];
  const list = (await mgr.get('/employees')).data;
  ok(list.find((e) => e.id === a.data.id)?.current_salary == 75000, 'staff list shows current salary');
  ok(list.find((e) => e.id === legacy.id)?.current_salary === null, 'existing worker without salary still lists (salary null)');
  ok((await mgr.get(`/employees/${legacy.id}`)).status === 200, 'existing worker profile still loads');
  const upd = await mgr.post('/payroll/salary', { employeeId: a.data.id, basicSalary: 80000 });
  ok(upd.status === 201, 'authorised manager can edit salary (history preserved)');
  ok((await mgr.get(`/employees/${a.data.id}`)).data.salaryHistory.length === 2 && (await mgr.get(`/employees/${a.data.id}`)).data.salaryHistory[0].basic_salary == 80000, 'latest salary is first, old one kept');
  ok((await mgr.post('/payroll/salary', { employeeId: a.data.id, basicSalary: -1 })).status === 400, 'salary edit validates input');

  // staff logins
  const mkLogin = async (emp, email, role = 'TEACHER') => (await mgr.post(`/employees/${emp}/login`, { email, password: 'Passw0rd!x', role })).status;
  ok(await mkLogin(a.data.id, em('teacherA')) === 201 && await mkLogin(b.data.id, em('teacherB'), 'EMPLOYEE') === 201, 'staff logins created');
  await query('UPDATE users SET must_change_password=false WHERE email LIKE $1', [`%.${tag}@test.local`]);
  const tA = await loginAs(em('teacherA')); const tB = await loginAs(em('teacherB'));
  const meA = (await tA.get('/employees/me')).data;
  ok(meA.salaryHistory?.[0]?.basic_salary == 80000, 'staff member sees own salary on own profile');
  ok((await tB.get(`/employees/${a.data.id}`)).status === 403, "another staff member cannot open someone else's profile/salary");
  ok((await tB.get('/employees')).status === 403, 'staff cannot list staff (salaries)');
  ok((await tB.post('/payroll/salary', { employeeId: b.data.id, basicSalary: 999999 })).status === 403, 'staff cannot edit their own salary');
  const posT = (await tB.get('/employees/meta/positions')).data;
  ok(posT.length && !('default_salary' in posT[0]), 'position default_salary hidden from staff');
  ok('default_salary' in (await mgr.get('/employees/meta/positions')).data[0], 'position default_salary visible to management');
  ok((await (await loginAs(em('vice'))).get('/employees')).status === 403, 'management post without "teachers" permission cannot see staff list');

  console.log('\n[2] Staff -> management conversations');
  const pr = await loginAs(em('principal')); const vice = await loginAs(em('vice')); const owner = await loginAs(ownerEmail);
  const c1 = await tA.post('/conversations', { channel: 'STAFF_MANAGEMENT', subject: 'Leave of absence', category: 'REQUEST', body: 'May I have Friday off?' });
  ok(c1.status === 201, 'staff can start a conversation with management');
  ok((await tA.post('/conversations', { channel: 'STAFF_MANAGEMENT', subject: '', body: 'x' })).status === 400, 'empty subject rejected');
  ok((await tA.post('/conversations', { channel: 'MANAGER_OWNER', subject: 's', body: 'x' })).status === 403, 'staff cannot write to the owner channel');
  const id1 = c1.data.id;
  ok((await tB.get(`/conversations/${id1}`)).status === 404, "other staff cannot open someone else's conversation");
  ok((await tB.post(`/conversations/${id1}/messages`, { body: 'hi' })).status === 404, 'other staff cannot post into it');
  ok((await tB.get('/conversations/inbox?channel=STAFF_MANAGEMENT')).status === 403, 'staff cannot open the management inbox');
  ok((await vice.get('/conversations/inbox?channel=STAFF_MANAGEMENT')).status === 403, 'management post without permission cannot read staff messages');
  ok((await vice.get(`/conversations/${id1}`)).status === 404, '...nor open a thread by id');
  const inbox = (await pr.get('/conversations/inbox?channel=STAFF_MANAGEMENT')).data;
  const row = inbox.find((r) => r.id === id1);
  ok(row && row.unread === true && row.participant_name === 'Ann Alpha' && row.category === 'REQUEST', 'manager sees it unread, with the staff member identified');
  ok((await pr.get('/conversations/unread-count')).data.staffInbox >= 1, 'manager unread counter');
  const notifM = (await pr.get('/notifications')).data;
  ok(notifM.some((n) => n.entity_id === id1 && /Ann Alpha/.test(n.title)), 'manager got a notification about the new staff message');
  ok((await pr.get(`/conversations/${id1}`)).data.messages.length === 1, 'manager opens the thread');
  ok((await pr.get('/conversations/inbox?channel=STAFF_MANAGEMENT')).data.find((r) => r.id === id1).unread === false, 'opening marks it read for that manager');
  ok((await owner.get('/conversations/inbox?channel=STAFF_MANAGEMENT')).data.find((r) => r.id === id1)?.unread === true, "...but not for the owner (read state is per person)");
  ok((await pr.post(`/conversations/${id1}/messages`, { body: 'Approved. Enjoy your day off.' })).status === 201, 'manager replies');
  const mineA = (await tA.get('/conversations/mine?channel=STAFF_MANAGEMENT')).data;
  ok(mineA.length === 1 && mineA[0].unread === true && mineA[0].message_count === 2, 'staff sees the reply as unread in their sent/received list');
  ok((await tA.get('/notifications')).data.some((n) => n.entity_id === id1 && /replied/.test(n.title)), 'staff got a reply notification');
  ok((await tA.get('/notifications/unread-count')).data.count >= 1, 'bell unread counter > 0 for staff');
  const full = (await tA.get(`/conversations/${id1}`)).data;
  ok(full.messages.length === 2 && full.messages[1].sender_name === 'Pat Principal', 'staff opens thread and sees who replied');
  ok((await tA.get('/conversations/unread-count')).data.mine === 0, 'staff unread cleared after opening');
  ok((await tA.post(`/conversations/${id1}/messages`, { body: 'Thank you!' })).status === 201, 'staff continues the conversation');
  ok((await pr.get('/conversations/inbox?channel=STAFF_MANAGEMENT')).data.find((r) => r.id === id1).unread === true, 'manager sees the follow-up as unread');
  ok((await tA.patch(`/conversations/${id1}/status`, { status: 'CLOSED' })).status === 403, 'staff cannot close; only management');
  ok((await pr.patch(`/conversations/${id1}/status`, { status: 'CLOSED' })).status === 200, 'manager closes the conversation');
  ok((await pr.post(`/conversations/${id1}/messages`, { body: 'x' })).status === 409, 'manager cannot reply to a closed thread');
  ok((await tA.post(`/conversations/${id1}/messages`, { body: 'One more thing' })).status === 201 && (await tA.get(`/conversations/${id1}`)).data.status === 'OPEN', 'staff message re-opens it');
  const xss = (await tA.post('/conversations', { channel: 'STAFF_MANAGEMENT', subject: '<img src=x onerror=alert(1)>', body: 'a\u0000b' + 'z'.repeat(6000) })).data.id;
  const xm = (await tA.get(`/conversations/${xss}`)).data;
  ok(xm.messages[0].body.length === 5000 && !xm.messages[0].body.includes('\u0000'), 'body length capped and control characters stripped (HTML is escaped when rendered)');

  console.log('\n[3] Manager -> owner conversations');
  const o1 = await pr.post('/conversations', { channel: 'MANAGER_OWNER', subject: 'Budget request', category: 'REQUEST', body: 'Need funds for textbooks.' });
  ok(o1.status === 201, 'manager can message the owner');
  ok((await pr.post('/conversations', { channel: 'STAFF_MANAGEMENT', subject: 's', body: 'x' })).status === 403, 'manager cannot open a staff-side thread');
  ok((await vice.get(`/conversations/${o1.data.id}`)).status === 404, 'other managers cannot read it');
  ok((await mgr.get(`/conversations/${o1.data.id}`)).status === 404, '...including the legacy Manager');
  ok((await tA.get(`/conversations/${o1.data.id}`)).status === 404, '...and staff cannot');
  ok((await pr.get('/conversations/inbox?channel=MANAGER_OWNER')).status === 403, 'manager cannot open the owner inbox');
  const oi = (await owner.get('/conversations/inbox?channel=MANAGER_OWNER')).data;
  ok(oi.find((r) => r.id === o1.data.id)?.unread === true && oi.find((r) => r.id === o1.data.id).participant_name === 'Pat Principal', 'owner sees it unread, with the manager identified');
  ok((await owner.get('/notifications')).data.some((n) => n.entity_id === o1.data.id), 'owner notified of the manager message');
  ok((await owner.post(`/conversations/${o1.data.id}/messages`, { body: 'Approved, see the accountant.' })).status === 201, 'owner replies');
  ok((await pr.get('/notifications')).data.some((n) => n.entity_id === o1.data.id && /Owner replied/.test(n.title)), 'manager notified of the owner reply');
  ok((await pr.get('/conversations/mine?channel=MANAGER_OWNER')).data[0].unread === true, 'manager sees reply unread');
  ok((await pr.get(`/conversations/${o1.data.id}`)).data.messages.length === 2, 'manager reads the reply (history kept)');

  console.log('\n[4] Notifications');
  ok((await tA.post('/notifications', { audience: 'ALL', title: 't', message: 'm' })).status === 403, 'staff cannot send notifications');
  ok((await vice.post('/notifications', { audience: 'ALL', title: 't', message: 'm' })).status === 403, 'management post without announcements permission cannot send');
  ok((await pr.post('/notifications', { audience: 'ALL', title: '', message: 'm' })).status === 400, 'validation: title required');
  ok((await pr.post('/notifications', { audience: 'NOBODY', title: 't', message: 'm' })).status === 400, 'validation: audience required');
  const before = (await tB.get('/notifications/unread-count')).data.count;
  ok((await pr.post('/notifications', { audience: 'STAFF', title: 'Staff meeting', message: 'Friday 8am in the hall', type: 'WARNING' })).status === 201, 'manager sends a notification to all staff');
  const nB = (await tB.get('/notifications')).data; const sm = nB.find((n) => n.title === 'Staff meeting');
  ok(sm && sm.message && sm.created_at && sm.read === false, 'recipient sees title, message, timestamp, unread');
  ok((await tB.get('/notifications/unread-count')).data.count === before + 1, 'unread counter incremented');
  ok((await pr.post('/notifications', { audience: 'USER', userId: (await query('SELECT id FROM users WHERE email=$1', [em('teacherA')])).rows[0].id, title: 'Just you', message: 'private' })).status === 201, 'manager sends to one person');
  ok(!(await tB.get('/notifications')).data.some((n) => n.title === 'Just you') && (await tA.get('/notifications')).data.some((n) => n.title === 'Just you'), 'targeted notification reaches only that person');
  await tB.patch(`/notifications/${sm.id}/read`);
  ok((await tB.get('/notifications/unread-count')).data.count === before, 'mark as read lowers the counter');
  ok((await tB.get('/notifications')).data.find((n) => n.id === sm.id).read === true, 'history keeps the read notification');
  ok((await tB.post('/notifications/read-all')).status === 200 && (await tB.get('/notifications/unread-count')).data.count === 0, 'mark all read');
  ok((await pr.get('/notifications/sent')).data.some((n) => n.title === 'Staff meeting'), 'sender can review what was sent');

  console.log('\n[5] Web push');
  const mock = await startPushService(4443);
  const status = (await tA.get('/push/status')).data;
  ok(status.configured && status.publicKey === fs.readFileSync('/tmp/claude-0/vapid_pub', 'utf8').trim(), 'server reports push configured + public key');
  ok((await tA.post('/push/subscribe', { subscription: { endpoint: 'http://insecure/x', keys: {} } })).status === 400, 'rejects invalid/insecure subscription');
  const sA = newSub('devA'); const sGone = newSub('gone1'); const sB = newSub('devB');
  ok((await tA.post('/push/subscribe', { subscription: sA.json })).status === 201, 'staff A subscribes a device');
  ok((await tA.post('/push/subscribe', { subscription: sGone.json })).status === 201, 'staff A subscribes a second (soon-expired) device');
  ok((await tB.post('/push/subscribe', { subscription: sB.json })).status === 201, 'staff B subscribes');
  ok((await new Client().post('/push/subscribe', { subscription: sA.json })).status === 401, 'anonymous cannot subscribe');
  mock.received.length = 0;
  await pr.post(`/conversations/${id1}/messages`, { body: 'Reply while your phone is locked' }).catch(() => {});
  await pr.patch(`/conversations/${id1}/status`, { status: 'OPEN' }); // reopen then reply
  await pr.post(`/conversations/${id1}/messages`, { body: 'Reply while your phone is locked' });
  await wait(1500);
  const toA = mock.received.filter((r) => r.id === 'devA'); const toB = mock.received.filter((r) => r.id === 'devB');
  ok(toA.length >= 1 && toB.length === 0, 'push goes to the intended person only');
  if (toA.length) {
    const pl = JSON.parse(decryptAes128gcm(toA[toA.length - 1].body, sA));
    ok(/replied/.test(pl.title) && pl.body.includes('phone is locked') && pl.url.startsWith('/communication.html'), 'payload decrypts (RFC 8291) with correct title/body/link');
    ok(verifyVapid(toA[0].headers.authorization, status.publicKey), 'VAPID signature verifies against the public key');
    ok(toA[0].headers['content-encoding'] === 'aes128gcm' && toA[0].headers.ttl, 'correct Content-Encoding and TTL headers');
  }
  ok(mock.received.some((r) => r.id === 'gone1') && (await query('SELECT 1 FROM push_subscriptions WHERE endpoint LIKE $1', ['%/gone1'])).rows.length === 0, 'expired subscription (410) is deleted automatically');
  mock.received.length = 0;
  ok((await tA.put('/push/preferences', { push_enabled: true, push_messages: false, push_updates: true })).status === 200, 'user turns off message push');
  await pr.post(`/conversations/${id1}/messages`, { body: 'second reply' }); await wait(800);
  ok(mock.received.filter((r) => r.id === 'devA').length === 0, 'preference respected: no push for messages');
  await pr.post('/notifications', { audience: 'USER', userId: (await query('SELECT id FROM users WHERE email=$1', [em('teacherA')])).rows[0].id, title: 'Notice', message: 'update kind' }); await wait(800);
  ok(mock.received.filter((r) => r.id === 'devA').length === 1, 'updates still pushed when only messages are off');
  ok((await tA.get('/notifications')).data.some((n) => n.title.includes('second') || n.message === 'second reply'), 'in-app bell still receives what push skipped');
  mock.received.length = 0;
  await tA.put('/push/preferences', { push_enabled: false, push_messages: true, push_updates: true });
  await pr.post('/notifications', { audience: 'USER', userId: (await query('SELECT id FROM users WHERE email=$1', [em('teacherA')])).rows[0].id, title: 'Silent', message: 'x' }); await wait(800);
  ok(mock.received.length === 0, 'master switch off: nothing pushed');
  await tA.put('/push/preferences', { push_enabled: true, push_messages: true, push_updates: true });
  ok((await tA.post('/push/unsubscribe', { endpoint: sA.json.endpoint })).status === 200 && (await query('SELECT 1 FROM push_subscriptions WHERE endpoint=$1', [sA.json.endpoint])).rows.length === 0, 'unsubscribe removes the device (used on logout)');
  ok((await tB.post('/push/unsubscribe', { endpoint: sA.json.endpoint })).status === 200 && true, 'unsubscribing someone else\'s endpoint is a no-op');
  mock.srv.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
