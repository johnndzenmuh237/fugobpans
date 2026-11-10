process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';

const mockCalls = [];
let mockPending, mockInvoice;
const mockClient = {
  query: jest.fn(async (sql, params = []) => {
    mockCalls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/FROM payments WHERE id = \$1 AND status = 'PENDING' FOR UPDATE/.test(sql)) return { rows: mockPending ? [mockPending] : [] };
    if (/FROM invoices WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [mockInvoice] };
    if (/UPDATE payments SET status = 'SUCCESSFUL'/.test(sql)) return { rows: [{ id: 'p1', status: 'SUCCESSFUL', amount: params[0], receipt_number: params[1] }] };
    if (/UPDATE payments SET status = 'FAILED'/.test(sql)) return { rows: [{ id: 'p1', status: 'FAILED', amount: 25000, transaction_reference: 'TX123456' }] };
    return { rows: [] };
  }),
};
jest.mock('../server/config/db', () => ({ query: jest.fn(async () => ({ rows: [] })), withTransaction: jest.fn(async (fn) => fn(mockClient)), pool: {} }));
jest.mock('../server/utils/idGenerator', () => ({ nextId: jest.fn(async () => 'REC-2026-000042') }));
jest.mock('../server/services/messagingService', () => ({ getMessagingSettings: jest.fn(async () => null), sendMessage: jest.fn(async () => ({ status: 'NOT_CONFIGURED' })), configured: () => ({}) }));
jest.mock('../server/services/notificationService', () => ({ notify: jest.fn() }));
jest.mock('../server/utils/auditLogger', () => ({ writeAudit: jest.fn(async () => {}) }));

const svc = require('../server/services/verificationService');
const actor = { uid: 'u-mgr', name: 'Marie Manager', role: 'MANAGER' };

beforeEach(() => {
  mockCalls.length = 0;
  mockPending = { id: 'p1', invoice_id: 'i1', amount: '25000.00', status: 'PENDING' };
  mockInvoice = { id: 'i1', total_amount: '100000.00', amount_paid: '50000.00', balance: '50000.00' };
});
const sql = (re) => mockCalls.filter((c) => re.test(c.sql));

test('verify: credits the invoice once, issues a receipt, and records WHO decided', async () => {
  await svc.verifyPayment('p1', actor, { note: 'seen on statement' }, null);
  const inv = sql(/UPDATE invoices SET amount_paid/)[0];
  expect(inv.params[0]).toBe(75000);
  expect(inv.params[1]).toBe('PARTIALLY_PAID');
  const hist = sql(/INSERT INTO payment_verification_history/)[0];
  expect(hist.params[1]).toBe('VERIFIED');
  expect(hist.params[6]).toBe('u-mgr');
  expect(hist.params[7]).toBe('Marie Manager');
  expect(hist.params[5]).toBe('REC-2026-000042');
});

test('verify: a corrected amount is what is credited, and the correction is written into the history', async () => {
  await svc.verifyPayment('p1', actor, { confirmedAmount: 20000 }, null);
  expect(sql(/UPDATE invoices SET amount_paid/)[0].params[0]).toBe(70000);
  expect(sql(/INSERT INTO payment_verification_history/)[0].params[9]).toMatch(/corrected from 25,000 to 20,000/);
});

test('verify: paying off the balance marks the invoice FULLY_PAID', async () => {
  mockInvoice.amount_paid = '75000.00'; mockInvoice.balance = '25000.00';
  await svc.verifyPayment('p1', actor, {}, null);
  expect(sql(/UPDATE invoices SET amount_paid/)[0].params[1]).toBe('FULLY_PAID');
});

test('verify: refuses an amount larger than the balance and changes nothing', async () => {
  await expect(svc.verifyPayment('p1', actor, { confirmedAmount: 60000 }, null)).rejects.toThrow(/more than the invoice balance/);
  expect(sql(/UPDATE invoices/)).toHaveLength(0);
});

test('verify/reject: a payment someone already decided cannot be decided again (no double credit)', async () => {
  mockPending = null;
  await expect(svc.verifyPayment('p1', actor, {}, null)).rejects.toMatchObject({ statusCode: 409 });
  await expect(svc.rejectPayment('p1', actor, 'wrong transaction id', null)).rejects.toMatchObject({ statusCode: 409 });
  expect(sql(/UPDATE invoices/)).toHaveLength(0);
});

test('reject: needs a real reason, never touches the invoice, and records WHO rejected', async () => {
  await expect(svc.rejectPayment('p1', actor, 'no', null)).rejects.toThrow(/reason/);
  await svc.rejectPayment('p1', actor, 'transaction ID not found on the account', null);
  expect(sql(/UPDATE invoices/)).toHaveLength(0);
  const hist = sql(/INSERT INTO payment_verification_history/)[0];
  expect(hist.params[1]).toBe('REJECTED');
  expect(hist.params[7]).toBe('Marie Manager');
});
