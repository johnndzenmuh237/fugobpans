process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.DATABASE_URL = 'postgresql://x:y@127.0.0.1:1/none'; // never connected to in these tests

const { last9, toE164, mask, waLink } = require('../server/utils/phone');
const { parseCsv, parseCsvObjects } = require('../server/utils/csv');
const { parseStatement, parseAmount, parseTime, classifyLine } = require('../server/utils/statementParser');
const { planReminders, renderTemplate } = require('../server/utils/reminderPlan');
const { hasPermission, FINE_PERMISSIONS } = require('../server/middleware/roles');
const { parseEvidence, issuePortalToken, portalTokenStudentId } = require('../server/services/verificationService');
const { normTx } = require('../server/utils/paymentHistory');

describe('phone helpers', () => {
  test('all common Cameroon spellings are the same number', () => {
    const forms = ['677123456', '0677 12 34 56', '+237 677 12 34 56', '00237677123456', '237-677-123-456'];
    expect(new Set(forms.map(last9)).size).toBe(1);
    expect(last9('12345')).toBe('');
  });
  test('E.164 + mask + wa.me', () => {
    expect(toE164('677123456')).toBe('+237677123456');
    expect(toE164('+237677123456')).toBe('+237677123456');
    expect(toE164('123')).toBeNull();
    expect(mask('677123456')).not.toContain('67712');
    expect(waLink('677123456', 'Hi there')).toBe('https://wa.me/237677123456?text=Hi%20there');
  });
});

describe('csv + statements', () => {
  test('quotes, escaped quotes, CRLF, semicolons, BOM', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsvObjects('Financial Transaction Id,Amount\nT1,500').records[0]).toEqual({ 'financial transaction id': 'T1', amount: '500' });
  });
  test('amount formats', () => {
    expect(parseAmount('25,000')).toBe(25000);
    expect(parseAmount('25 000 FCFA')).toBe(25000);
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('1.250,50')).toBe(1250.5);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('abc')).toBeNull();
  });
  test('dates are day-first and Cameroon time', () => {
    expect(parseTime('05/03/2026 14:30')).toBe('2026-03-05T13:30:00.000Z');
    expect(parseTime('2026-03-05T14:30:00Z')).toBe('2026-03-05T14:30:00.000Z');
    expect(parseTime('')).toBeNull();
  });
  test('statement keeps credits, drops debits/failed/duplicates-in-form, explains unknown layouts', () => {
    const csv = 'Date,Transaction ID,Type,Amount,Status,From\n05/03/2026 10:00,MP26.0305.A1,Payment received,25000,Successful,677111222\n05/03/2026 11:00,MP26.0305.A2,Cash out,5000,Successful,\n05/03/2026 12:00,MP26.0305.A3,Payment received,7000,Failed,677\n,,,,\n';
    const r = parseStatement(csv);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ txIdNorm: 'MP260305A1', amount: 25000 });
    expect(r.skipped).toBe(2);
    expect(() => parseStatement('foo,bar\n1,2')).toThrow(/Columns in your file/);
  });
  test('classification', () => {
    const line = { amount: 25000 };
    expect(classifyLine(line, null)).toBe('UNRECORDED');
    expect(classifyLine(line, { status: 'SUCCESSFUL', amount: '25000.00' })).toBe('MATCHED');
    expect(classifyLine(line, { status: 'SUCCESSFUL', amount: 30000 })).toBe('AMOUNT_MISMATCH');
    expect(classifyLine(line, { status: 'PENDING', amount: 25000 })).toBe('PENDING_VERIFICATION');
    expect(classifyLine(line, { status: 'FAILED', amount: 25000 })).toBe('REJECTED_BUT_RECEIVED');
    expect(normTx(' mp26.03-05 a1 ')).toBe('MP260305A1');
  });
});

describe('reminder planning', () => {
  const settings = { days_before: [7, 3, 1], remind_on_due: true, overdue_every_days: 7, max_overdue_reminders: 2, outstanding_every_days: 0 };
  const inv = { id: 'i1', total_amount: 90000, amount_paid: 30000 };
  const inst = [
    { id: 'a', name: 'First', amount: 30000, due_date: '2026-01-10', sort_order: 0 },
    { id: 'b', name: 'Second', amount: 30000, due_date: '2026-02-10', sort_order: 1 },
    { id: 'c', name: 'Third', amount: 30000, due_date: '2026-03-10', sort_order: 2 },
  ];
  const plan = (today, sent = [], i = inv) => planReminders({ today, settings, invoice: i, installments: inst, sent });

  test('first instalment is paid, so only the second is chased', () => {
    const p = plan('2026-02-03');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ installmentId: 'b', kind: 'UPCOMING:7', amountDue: 30000 });
  });
  test('thresholds fire once, in order, never a larger one again', () => {
    expect(plan('2026-02-01')).toHaveLength(0); // 9 days away
    expect(plan('2026-02-03', [{ installment_id: 'b', kind: 'UPCOMING:7', sent_on: '2026-02-03' }])).toHaveLength(0);
    expect(plan('2026-02-04', [{ installment_id: 'b', kind: 'UPCOMING:7', sent_on: '2026-02-03' }])).toHaveLength(0); // 6 days: candidate is still 7 (sent)
    expect(plan('2026-02-07')[0].kind).toBe('UPCOMING:3');
    expect(plan('2026-02-09')[0].kind).toBe('UPCOMING:1');
  });
  test('due day, then overdue repeats every 7 days up to the maximum', () => {
    expect(plan('2026-02-10')[0].kind).toBe('DUE');
    expect(plan('2026-02-10', [{ installment_id: 'b', kind: 'DUE', sent_on: '2026-02-10' }])).toHaveLength(0);
    expect(plan('2026-02-12')[0].kind).toBe('OVERDUE');
    const s1 = [{ installment_id: 'b', kind: 'OVERDUE', sent_on: '2026-02-12' }];
    expect(plan('2026-02-15', s1)).toHaveLength(0);
    expect(plan('2026-02-19', s1)[0].kind).toBe('OVERDUE');
    const s2 = [...s1, { installment_id: 'b', kind: 'OVERDUE', sent_on: '2026-02-19' }];
    expect(plan('2026-03-01', s2).filter((x) => x.installmentId === 'b')).toHaveLength(0); // max 2 reached
  });
  test('part payment leaves only the unpaid remainder; paying ahead clears later ones; fully paid = silence', () => {
    const part = plan('2026-02-10', [], { ...inv, amount_paid: 45000 }).find((x) => x.installmentId === 'b');
    expect(part.amountDue).toBe(15000);
    expect(plan('2026-02-10', [], { ...inv, amount_paid: 60000 })).toHaveLength(0);
    expect(plan('2026-02-10', [], { ...inv, amount_paid: 90000 })).toHaveLength(0);
  });
  test('invoice with no schedule: optional balance nudge only', () => {
    const base = { today: '2026-02-10', invoice: inv, installments: [], sent: [] };
    expect(planReminders({ ...base, settings })).toHaveLength(0);
    const on = { ...settings, outstanding_every_days: 14 };
    expect(planReminders({ ...base, settings: on })[0]).toMatchObject({ kind: 'BALANCE', amountDue: 60000 });
    expect(planReminders({ ...base, settings: on, sent: [{ installment_id: null, kind: 'BALANCE', sent_on: '2026-02-01' }] })).toHaveLength(0);
  });
  test('templates keep unknown placeholders visible', () => {
    expect(renderTemplate('Hi {guardian}, {x}', { guardian: 'Mama' })).toBe('Hi Mama, {x}');
  });
});

describe('permissions (granular, backwards compatible)', () => {
  const u = (role, permissions = {}) => ({ role, permissions });
  test('owner can do everything', () => { Object.keys(FINE_PERMISSIONS).forEach((k) => expect(hasPermission(u('OWNER'), k)).toBe(true)); });
  test('legacy accounts behave exactly as before', () => {
    expect(hasPermission(u('MANAGER'), 'approve_payments')).toBe(true);
    expect(hasPermission(u('MANAGER'), 'reconcile_payments')).toBe(false);
    expect(hasPermission(u('PRINCIPAL', { finance: true }), 'approve_payments')).toBe(true);
    expect(hasPermission(u('PRINCIPAL', { students: true }), 'approve_payments')).toBe(false);
    expect(hasPermission(u('ADMINISTRATOR', { registrations: true }), 'register_students')).toBe(true);
    expect(hasPermission(u('ACCOUNTANT'), 'approve_payments')).toBe(true);
    expect(hasPermission(u('ACCOUNTANT'), 'modify_fees')).toBe(false);
    expect(hasPermission(u('TEACHER'), 'approve_payments')).toBe(false);
  });
  test('explicit values always win — even over the legacy top-level manager', () => {
    expect(hasPermission(u('MANAGER', { approve_payments: false }), 'approve_payments')).toBe(false);
    expect(hasPermission(u('PRINCIPAL', { finance: true, approve_payments: false }), 'approve_payments')).toBe(false);
    expect(hasPermission(u('ADMINISTRATOR', { approve_payments: true }), 'approve_payments')).toBe(true);
    expect(hasPermission(u('PRINCIPAL', { reconcile_payments: true }), 'reconcile_payments')).toBe(true);
    expect(hasPermission(null, 'approve_payments')).toBe(false);
    expect(hasPermission(u('MANAGER'), 'nonsense')).toBe(false);
  });
});

describe('screenshots and tokens', () => {
  const png = (extra = 3000) => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 1)]).toString('base64')}`;
  test('accepts a real image, rejects fakes, tiny and huge files', () => {
    expect(parseEvidence(png()).mime).toBe('image/png');
    const fake = `data:image/png;base64,${Buffer.alloc(3000, 65).toString('base64')}`; // declared PNG, bytes are not
    expect(() => parseEvidence(fake)).toThrow(/not a valid/);
    expect(() => parseEvidence(`data:text/html;base64,${Buffer.from('<script>').toString('base64')}`)).toThrow(/JPG, PNG or WEBP/);
    expect(() => parseEvidence(png(10))).toThrow(/too small/);
    expect(() => parseEvidence(png(4.5 * 1024 * 1024))).toThrow(/4 MB/);
    expect(() => parseEvidence(undefined)).toThrow();
  });
  test('portal token is bound to one student and is not a login session', () => {
    const t = issuePortalToken('student-1');
    expect(portalTokenStudentId(t)).toBe('student-1');
    expect(portalTokenStudentId(t + 'x')).toBeNull();
    expect(portalTokenStudentId(require('jsonwebtoken').sign({ uid: 'u1' }, process.env.JWT_SECRET))).toBeNull();
  });
});

describe('HTTP wiring (no database needed)', () => {
  let server, base;
  beforeAll(async () => {
    const app = require('../server/app');
    await new Promise((r) => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  const call = (path, opts = {}) => fetch(base + path, { headers: { 'Content-Type': 'application/json' }, ...opts });

  test.each([
    ['/payments/manual/pending'], ['/payments/manual/history'], ['/payments/manual/00000000-0000-0000-0000-000000000000/evidence'],
    ['/reminders/settings'], ['/reminders/preview'], ['/reconciliation/report?provider=MTN_MOMO'], ['/reconciliation/imports'],
  ])('staff endpoint %s requires login', async (path) => { expect((await call(path)).status).toBe(401); });

  test.each([
    ['/payments/manual/00000000-0000-0000-0000-000000000000/confirm'], ['/payments/manual/00000000-0000-0000-0000-000000000000/reject'],
    ['/reminders/run'], ['/reconciliation/import'], ['/reconciliation/resolve'],
  ])('decision endpoint %s requires login', async (path) => { expect((await call(path, { method: 'POST', body: '{}' })).status).toBe(401); });

  test('public payment submit validates before touching anything, and accepts a 5 MB screenshot body size', async () => {
    let r = await call('/public-payments/submit', { method: 'POST', body: JSON.stringify({ trackingCode: 'X', provider: 'CASH' }) });
    expect(r.status).toBe(400);
    r = await call('/public-payments/submit', { method: 'POST', body: JSON.stringify({ provider: 'MTN', transactionId: 'abc', payerPhone: '1', amount: 5, evidence: 'x'.repeat(5 * 1024 * 1024) }) });
    expect(r.status).toBe(400); // rejected by validation, NOT 413 payload-too-large
  });
  test('recovery and OTP endpoints validate input', async () => {
    expect((await call('/recovery/request', { method: 'POST', body: JSON.stringify({ phone: '12' }) })).status).toBe(400);
    expect((await call('/recovery/verify', { method: 'POST', body: JSON.stringify({ phone: '12', code: '123456' }) })).status).toBe(400);
  });
  test('global body limit still protects other routes', async () => {
    const r = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(3 * 1024 * 1024) }) });
    expect(r.status).toBe(413);
  });
});
