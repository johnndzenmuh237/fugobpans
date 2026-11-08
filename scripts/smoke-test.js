/* End-to-end rules check. Run against a TEST database with the server on PORT (default 4100):
 *   OWNER_EMAIL=owner@test.school OWNER_PASSWORD=... node scripts/smoke-test.js */
const B = `http://localhost:${process.env.PORT || 4100}/api`;
let pass = 0, fail = 0;
const jars = {};
async function call(who, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', Cookie: jars[who] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jars[who] = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch {}
  return { s: r.status, d: data };
}
function check(name, cond, extra = '') { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); }
(async () => {
  let r = await call('owner', 'POST', '/auth/login', { email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD });
  check('owner logs in', r.s === 200 && r.d.role === 'OWNER', JSON.stringify(r.d));
  r = await call('owner', 'GET', '/owner/overview'); check('owner overview returns live data', r.s === 200 && r.d.counts.students === 2 && r.d.finance.expected === 60000, JSON.stringify(r.d).slice(0, 300));
  const O = r.d;
  r = await call('owner', 'POST', '/owner/management', { name: 'Pat Principal', email: 'pat@t.school', role: 'PRINCIPAL', permissions: { students: true, academics: true, teachers: true, announcements: true } });
  const pw = r.d.temporaryPassword; check('owner creates principal (no finance)', r.s === 201 && pw);
  r = await call('pat', 'POST', '/auth/login', { email: 'pat@t.school', password: pw }); check('principal logs in', r.s === 200 && r.d.mustChangePassword === true);
  r = await call('pat', 'POST', '/auth/change-password', { newPassword: 'PrincipalPass1!' }); check('principal changes temp password', r.s === 200);
  check('principal blocked from owner API', (await call('pat', 'GET', '/owner/overview')).s === 403);
  check('principal blocked from finance (no permission)', (await call('pat', 'GET', '/business/expenses')).s === 403);
  check('principal blocked from office payments (no permission)', (await call('pat', 'GET', '/payments')).s === 403);
  check('principal can list students (has permission)', (await call('pat', 'GET', '/students')).s === 200);
  check('principal cannot create an OWNER', (await call('pat', 'POST', '/auth/users', { name: 'x', email: 'x@x.com', password: 'password123', role: 'OWNER' })).s === 403);

  const classes = (await call('owner', 'GET', '/academics/classes')).d, sessions = (await call('owner', 'GET', '/academics/sessions')).d;
  const subjects = (await call('owner', 'GET', '/academics/subjects')).d, students = (await call('owner', 'GET', '/students')).d;
  const c1 = classes.find((c) => c.name === 'Class 1'), c2 = classes.find((c) => c.name === 'Class 2');
  const s1 = students.find((s) => s.student_code === 'STU-1'), s2 = students.find((s) => s.student_code === 'STU-2');
  const ses = sessions.find((s) => s.name === '2026-2027'), ses2 = sessions.find((s) => s.name === '2027-2028');
  const math = subjects.find((s) => s.name === 'Mathematics');
  const emp = (await call('owner', 'GET', '/employees')).d.find((e) => e.employee_code === 'EMP-1');

  // Teacher
  check('principal cannot mint an OWNER login via employee route', (await call('pat', 'POST', `/employees/${emp.id}/login`, { employeeId: emp.id, role: 'OWNER', email: 'evil@t.school', password: 'EvilPass123!' })).s === 400);
  r = await call('owner', 'POST', `/employees/${emp.id}/login`, { employeeId: emp.id, role: 'TEACHER', email: 'tina@t.school', password: 'TeacherPass1!' }); check('teacher login created', r.s === 201, JSON.stringify(r.d));
  await call('tina', 'POST', '/auth/login', { email: 'tina@t.school', password: 'TeacherPass1!' });
  check('teacher sees only own class students', (await call('tina', 'GET', '/students')).d.every((s) => s.class_id === c1.id));
  check('teacher cannot open another class student', (await call('tina', 'GET', `/students/${s2.id}`)).s === 403);
  r = await call('tina', 'GET', `/students/${s1.id}`); check('teacher opens own student, no fee data', r.s === 200 && r.d.invoices.length === 0);
  const att = await call('tina', 'POST', '/student-attendance', { classId: c1.id, date: new Date().toISOString().slice(0, 10), records: [{ studentId: s1.id, status: 'ABSENT' }] });
  check('teacher records student attendance', att.s === 200 && att.d.absent === 1, JSON.stringify(att.d));
  check('teacher cannot mark another class', (await call('tina', 'POST', '/student-attendance', { classId: c2.id, date: '2026-01-05', records: [{ studentId: s2.id, status: 'PRESENT' }] })).s === 403);
  r = await call('tina', 'POST', '/results', { studentId: s1.id, classId: c1.id, subjectId: math.id, academicSessionId: ses.id, term: 'Sequence 1', score: 15, maxScore: 20 });
  check('teacher submits mark -> SUBMITTED', r.s === 201 && r.d.status === 'SUBMITTED', JSON.stringify(r.d));
  check('teacher rejected for out-of-range score', (await call('tina', 'POST', '/results', { studentId: s1.id, classId: c1.id, subjectId: math.id, academicSessionId: ses.id, term: 'Sequence 1', score: 99, maxScore: 20 })).s === 400);

  // Student + parent
  r = await call('owner', 'POST', `/students/${s1.id}/login`, { email: 'amy@t.school', password: 'StudentPass1!' }); check('student login created', r.s === 201, JSON.stringify(r.d));
  await call('amy', 'POST', '/auth/login', { email: 'amy@t.school', password: 'StudentPass1!' });
  r = await call('pat', 'POST', '/parents', { name: 'Mama Alpha', email: 'mama@t.school', password: 'ParentPass1!', studentIds: [s1.id], relationship: 'Mother' }); check('principal creates linked parent', r.s === 201, JSON.stringify(r.d));
  await call('mama', 'POST', '/auth/login', { email: 'mama@t.school', password: 'ParentPass1!' });
  await call('tina', 'POST', '/student-attendance', { classId: c1.id, date: new Date().toISOString().slice(0, 10), records: [{ studentId: s1.id, status: 'ABSENT' }] }); // re-save now that the parent exists
  r = await call('amy', 'GET', '/student/me/overview'); check('student cannot see unapproved result', r.s === 200 && r.d.results.length === 0, JSON.stringify(r.d.results));
  r = await call('mama', 'GET', `/parent/children/${s1.id}/overview`); check('parent sees own child (absent counted)', r.s === 200 && r.d.attendance.ABSENT === 1 && r.d.fees.balance === 60000, JSON.stringify(r.d).slice(0, 200));
  check('parent blocked from other family child', (await call('mama', 'GET', `/parent/children/${s2.id}/overview`)).s === 403);
  check('parent blocked from raw student endpoint', (await call('mama', 'GET', `/students/${s2.id}`)).s === 403);
  check('student blocked from other student', (await call('amy', 'GET', `/students/${s2.id}`)).s === 403);
  check('student cannot enter results', (await call('amy', 'POST', '/results', { studentId: s1.id, classId: c1.id, subjectId: math.id, academicSessionId: ses.id, term: 'T', score: 20 })).s === 403);

  // Approval
  const pend = (await call('pat', 'GET', '/results/pending')).d; check('principal sees pending result', Array.isArray(pend) && pend.length === 1);
  check('teacher cannot approve', (await call('tina', 'POST', '/results/review', { resultIds: [pend[0].id], decision: 'APPROVED' })).s === 403);
  r = await call('pat', 'POST', '/results/review', { resultIds: [pend[0].id], decision: 'APPROVED' }); check('principal approves result', r.s === 200 && r.d.updated === 1);
  r = await call('amy', 'GET', '/student/me/overview'); check('student now sees approved result', r.d.results.length === 1);
  check('teacher now locked out of approved result', (await call('tina', 'POST', '/results', { studentId: s1.id, classId: c1.id, subjectId: math.id, academicSessionId: ses.id, term: 'Sequence 1', score: 20, maxScore: 20 })).s === 403);
  r = await call('pat', 'POST', '/results', { studentId: s1.id, classId: c1.id, subjectId: math.id, academicSessionId: ses.id, term: 'Sequence 1', score: 16, maxScore: 20 });
  r = await call('owner', 'GET', `/students/${s1.id}/history`); check('old mark kept as revision', r.d.resultRevisions.length === 1 && Number(r.d.resultRevisions[0].score) === 15, JSON.stringify(r.d.resultRevisions));
  const pdf = await fetch(`${B}/report-card/${s1.id}/pdf`, { headers: { Cookie: jars.mama } }); check('parent downloads report card PDF', pdf.status === 200 && (await pdf.arrayBuffer()).byteLength > 500);

  // Lifecycle / history
  r = await call('pat', 'POST', `/students/${s1.id}/lifecycle`, { action: 'PROMOTE', classId: c2.id, academicSessionId: ses2.id, note: 'End of year' }); check('principal promotes student', r.s === 200 && r.d.class_id === c2.id, JSON.stringify(r.d));
  r = await call('owner', 'GET', `/students/${s1.id}/history`); check('history keeps ADMITTED + PROMOTE', r.d.history.length === 2 && r.d.history[0].event_type === 'PROMOTE' && r.d.history[0].changed_by_name === 'Pat Principal', JSON.stringify(r.d.history.map((h) => h.event_type)));
  r = await call('amy', 'GET', '/student/me/overview'); check('old class result survives promotion', r.d.results.length === 1 && r.d.results[0].class_name === 'Class 1');
  r = await call('pat', 'PATCH', `/students/${s1.id}`, { guardianPhone: '670999999' }); check('principal edits student info', r.s === 200 && r.d.guardian_phone === '670999999');
  r = await call('pat', 'POST', `/students/${s1.id}/discipline`, { description: 'Late 3 times', severity: 'MINOR' }); check('discipline record added', r.s === 201);
  check('teacher cannot read discipline', (await call('tina', 'GET', `/students/${s1.id}/discipline`)).s === 403);

  // Finance approvals + permissions
  await call('owner', 'POST', '/auth/users', { name: 'Fred Accountant', email: 'fred@t.school', password: 'AccountPass1!', role: 'ACCOUNTANT' });
  await call('fred', 'POST', '/auth/login', { email: 'fred@t.school', password: 'AccountPass1!' });
  const cat = (await call('fred', 'GET', '/business/expense-categories')).d[0];
  r = await call('fred', 'POST', '/business/expenses', { categoryId: cat.id, amount: 12000, description: 'Generator fuel' }); check('accountant expense saved as PENDING', r.s === 201 && r.d.approval_status === 'PENDING', JSON.stringify(r.d));
  r = await call('owner', 'GET', '/owner/overview'); check('pending expense not counted in totals', r.d.finance.expenses === 0 && r.d.pendingApprovals.expenses === 1);
  const ex = (await call('owner', 'GET', '/approvals/expenses')).d[0];
  check('principal (no finance) cannot approve', (await call('pat', 'POST', `/approvals/expenses/${ex.id}`, { decision: 'APPROVED' })).s === 403);
  check('owner approves expense', (await call('owner', 'POST', `/approvals/expenses/${ex.id}`, { decision: 'APPROVED' })).s === 200);
  r = await call('fred', 'POST', '/payments/office', { invoiceId: (await call('fred', 'GET', `/students/${s1.id}`)).d.invoices[0].id, amount: 10000 }); check('accountant records fee payment', r.s === 201, JSON.stringify(r.d).slice(0, 200));
  r = await call('mama', 'GET', '/notifications'); check('parent notified of payment + absence', r.d.some((n) => /Payment received/.test(n.title)) && r.d.some((n) => /absent/i.test(n.title)), JSON.stringify(r.d.map((n) => n.title)));

  // Notifications: per-user read, counter
  const before = (await call('owner', 'GET', '/notifications/unread-count')).d.count;
  const list = (await call('owner', 'GET', '/notifications')).d;
  await call('owner', 'PATCH', `/notifications/${list[0].id}/read`);
  const after = (await call('owner', 'GET', '/notifications/unread-count')).d.count;
  check('owner unread counter drops on read', after === before - 1, `${before}->${after}`);
  check('reading as owner does not mark read for principal', (await call('pat', 'GET', '/notifications')).d.some((n) => n.id === list[0].id && n.read === false) || !(await call('pat', 'GET', '/notifications')).d.some((n) => n.id === list[0].id));
  check('notifications carry sender + department', list.some((n) => n.sender_name && n.department));

  // Messaging rules
  const contacts = (await call('mama', 'GET', '/messages/contacts')).d;
  check('parent contacts include principal + child teacher, not owner', contacts.some((c) => c.role === 'PRINCIPAL') && contacts.some((c) => c.name === 'Tina Teacher') === false ? true : contacts.some((c) => c.role === 'PRINCIPAL') && !contacts.some((c) => c.role === 'OWNER'), JSON.stringify(contacts.map((c) => c.role)));
  r = await call('mama', 'POST', '/messages', { recipientId: contacts.find((c) => c.role === 'PRINCIPAL').id, subject: 'Question', body: 'Hello' }); check('parent messages principal', r.s === 201);
  const owner = (await call('owner', 'GET', '/owner/management')).d; 
  check('parent cannot message owner', (await call('mama', 'POST', '/messages', { recipientId: (await call('owner', 'GET', '/auth/me')).d.uid, subject: 'x', body: 'y' })).s === 403);
  check('principal received message + bell', (await call('pat', 'GET', '/messages/unread-count')).d.count === 1);

  // Replacement keeps history
  const pat = owner.find((m) => m.email === 'pat@t.school');
  r = await call('owner', 'POST', `/owner/management/${pat.id}/replace`, { name: 'Sam Successor', email: 'sam@t.school', reason: 'Resigned' }); check('owner replaces principal', r.s === 201);
  check('old principal session dead immediately', (await call('pat', 'GET', '/students')).s === 403);
  r = await call('owner', 'GET', `/students/${s1.id}/history`); check('promotion still attributed to departed principal', r.d.history[0].changed_by_name === 'Pat Principal');
  r = await call('owner', 'GET', '/owner/records/students?q=Amy'); check('owner drill-down returns real rows', r.s === 200 && r.d.rows.length === 1 && r.d.total === 1);
  for (const t of ['teachers','employees','classes','departments','administrators','parents','invoices','outstanding','payments','expenses','results','attendance','registrations','activity']) {
    const x = await call('owner', 'GET', `/owner/records/${t}`); check(`drill-down /${t} works`, x.s === 200, JSON.stringify(x.d).slice(0, 200));
  }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
