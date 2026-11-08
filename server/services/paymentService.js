/**
 * Payments & receipts (spec §6, §8, §9).
 *
 * One rule protects the whole ledger: rent credit is only ever granted by
 * applyConfirmedPayment(), which runs inside a SQL transaction with the
 * tenant row locked. Tenant-submitted Mobile Money payments are stored as
 * PENDING and earn nothing until a Manager/Accountant confirms them, so a
 * made-up transaction ID can never buy credit. transaction_reference is
 * UNIQUE, so the same ID can't be submitted twice either.
 */
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');
const { computeReceiptSnapshot } = require('../utils/rent');
const { propertyScope, canAccessProperty } = require('../middleware/roles');
const { numify } = require('../utils/sql');
const { getSettings } = require('./settingsService');
const { notify, notifyStaff } = require('./notificationService');

const METHODS = ['MTN_MOMO', 'ORANGE_MONEY', 'OFFICE_CASH', 'BANK', 'OTHER'];
const money = (n) => `${Math.round(Number(n || 0)).toLocaleString('en-US')}`;

/**
 * Credits a payment to a tenant. Either INSERTs a new SUCCESSFUL payment
 * (office / registration) or promotes an existing PENDING one (confirm).
 * Must be called with a transaction `client`.
 */
async function applyConfirmedPayment(client, { tenantId, amount, type = 'RENT', method, transactionReference, recordedBy = null, notes = null, proofNote = null, tenantPaidAt = null, submittedByTenant = false, existingPaymentId = null }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new AppError('Amount must be greater than zero.');
  if (!METHODS.includes(method)) throw new AppError('Invalid payment method.');

  const { rows: tRows } = await client.query(
    `SELECT t.*, u.property_id FROM tenants t JOIN units u ON u.id = t.unit_id WHERE t.id = $1 FOR UPDATE OF t`, [tenantId]);
  const tenant = tRows[0];
  if (!tenant) throw new AppError('Tenant not found.', 404);

  const settings = await getSettings();
  let snapshot = { monthsCovered: null, periodFrom: null, periodTo: null, previousBalance: null, remainingBalance: null, nextPaymentDate: null };
  if (type === 'RENT') {
    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE tenant_id = $1 AND type = 'RENT' AND status = 'SUCCESSFUL'`, [tenantId]);
    snapshot = computeReceiptSnapshot({
      monthlyRent: tenant.monthly_rent, rentStartDate: tenant.rent_start_date, totalPaidBefore: Number(sumRows[0].total), amount: amt,
      dueSoonDays: settings.due_soon_days, graceDays: settings.grace_period_days,
    });
  }
  const receiptNumber = await nextId('REC');

  if (existingPaymentId) {
    const { rows } = await client.query(
      `UPDATE payments SET status = 'SUCCESSFUL', receipt_number = $1, months_covered = $2, period_from = $3, period_to = $4,
         previous_balance = $5, remaining_balance = $6, next_payment_date = $7, recorded_by = $8, paid_at = now()
       WHERE id = $9 AND status = 'PENDING' RETURNING *`,
      [receiptNumber, snapshot.monthsCovered, snapshot.periodFrom, snapshot.periodTo, snapshot.previousBalance, snapshot.remainingBalance, snapshot.nextPaymentDate, recordedBy, existingPaymentId]
    );
    if (!rows.length) throw new AppError('Pending payment not found (it may already have been confirmed or rejected).', 404);
    return rows[0];
  }

  const { rows } = await client.query(
    `INSERT INTO payments (receipt_number, tenant_id, unit_id, property_id, type, amount, months_covered, method, transaction_reference, status,
       proof_note, tenant_paid_at, submitted_by_tenant, period_from, period_to, previous_balance, remaining_balance, next_payment_date, recorded_by, notes, paid_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUCCESSFUL',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now()) RETURNING *`,
    [receiptNumber, tenantId, tenant.unit_id, tenant.property_id, type, amt, snapshot.monthsCovered, method, transactionReference, proofNote,
      tenantPaidAt, submittedByTenant, snapshot.periodFrom, snapshot.periodTo, snapshot.previousBalance, snapshot.remainingBalance, snapshot.nextPaymentDate, recordedBy, notes]
  );
  return rows[0];
}

function refFor(prefix) { return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }

async function loadTenantForPayment(user, tenantId) {
  const { rows } = await query('SELECT t.*, u.property_id FROM tenants t JOIN units u ON u.id = t.unit_id WHERE t.id = $1', [tenantId]);
  if (!rows.length) throw new AppError('Tenant not found.', 404);
  if (user && !canAccessProperty(user, rows[0].property_id)) throw new AppError('You are not assigned to that property.', 403);
  return rows[0];
}

/** Staff recorded a payment received in person / by bank / MoMo they already verified. Credits immediately. */
async function recordOfficePayment(body, actor) {
  const { tenantId, amount, type = 'RENT', method = 'OFFICE_CASH', transactionReference, notes } = body;
  if (!tenantId || !amount) throw new AppError('tenantId and amount are required.');
  if (!['RENT', 'DEPOSIT', 'OTHER'].includes(type)) throw new AppError('Invalid payment type.');
  const tenant = await loadTenantForPayment(actor, tenantId);
  const payment = await withTransaction((client) => applyConfirmedPayment(client, {
    tenantId, amount, type, method, transactionReference: (transactionReference || '').trim() || refFor('OFFICE'),
    recordedBy: actor.uid, notes: notes || null,
  }));
  await writeAudit({ user: actor, action: 'RECORD_PAYMENT', entity: 'payments', entityId: payment.id, after: payment });
  await notify({ toTenantId: tenant.id, title: 'Payment received', message: `We received ${money(amount)} FCFA. Receipt ${payment.receipt_number}.`, type: 'SUCCESS' });
  return payment;
}

/** Tenant (via the portal) submits a Mobile Money payment made externally. Stays PENDING. */
async function submitTenantPayment(tenantId, { amount, method, transactionId, paidAt, proofNote, type = 'RENT' }) {
  if (!amount || !method || !transactionId) throw new AppError('Amount, payment method and transaction ID are required.');
  if (!['MTN_MOMO', 'ORANGE_MONEY'].includes(method)) throw new AppError('Please choose MTN Mobile Money or Orange Money.');
  if (!['RENT', 'DEPOSIT'].includes(type)) throw new AppError('Invalid payment type.');
  if (!(Number(amount) > 0)) throw new AppError('Amount must be greater than zero.');
  const ref = String(transactionId).trim();
  if (ref.length < 4) throw new AppError('Please enter the full transaction ID from your Mobile Money confirmation message.');

  const { rows: tRows } = await query(
    `SELECT t.*, u.property_id, u.unit_no, u.house_no FROM tenants t JOIN units u ON u.id = t.unit_id WHERE t.id = $1`, [tenantId]);
  const tenant = tRows[0];
  if (!tenant) throw new AppError('Tenant not found.', 404);
  if (!['ACTIVE', 'NOTICE'].includes(tenant.status)) throw new AppError('This tenancy is no longer active.');

  try {
    const { rows } = await query(
      `INSERT INTO payments (tenant_id, unit_id, property_id, type, amount, method, transaction_reference, status, proof_note, tenant_paid_at, submitted_by_tenant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,true) RETURNING *`,
      [tenantId, tenant.unit_id, tenant.property_id, type, amount, method, ref, proofNote || null, paidAt || null]
    );
    await notifyStaff({
      title: 'New rent payment pending', type: 'WARNING', link: '/admin/pending-payments.html',
      message: `${tenant.first_name} ${tenant.last_name} (House ${tenant.house_no}, Unit ${tenant.unit_no}) submitted ${money(amount)} FCFA — transaction ${ref}. Please verify.`,
    });
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AppError('That transaction ID has already been submitted. Please check it, or contact management if you believe this is a mistake.');
    throw err;
  }
}

const PAYMENT_SELECT = `
  SELECT pay.*, (t.first_name || ' ' || t.last_name) AS tenant_name, t.tenant_code, t.tracking_code, t.phone AS tenant_phone, t.monthly_rent,
    u.unit_no, u.house_no, p.name AS property_name, p.property_code, c.name AS category_name, au.name AS authorized_by
  FROM payments pay
  JOIN tenants t ON t.id = pay.tenant_id
  JOIN units u ON u.id = pay.unit_id
  JOIN properties p ON p.id = pay.property_id
  LEFT JOIN categories c ON c.id = u.category_id
  LEFT JOIN users au ON au.id = pay.recorded_by`;

async function listPayments(user, { propertyId, tenantId, status, type, from, to, q } = {}) {
  const params = [];
  let sql = `${PAYMENT_SELECT} WHERE 1=1`;
  if (propertyId) { params.push(propertyId); sql += ` AND pay.property_id = $${params.length}`; }
  if (tenantId) { params.push(tenantId); sql += ` AND pay.tenant_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND pay.status = $${params.length}`; }
  if (type) { params.push(type); sql += ` AND pay.type = $${params.length}`; }
  if (from) { params.push(from); sql += ` AND COALESCE(pay.paid_at, pay.created_at)::date >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND COALESCE(pay.paid_at, pay.created_at)::date <= $${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (pay.receipt_number ILIKE $${params.length} OR pay.transaction_reference ILIKE $${params.length} OR t.first_name || ' ' || t.last_name ILIKE $${params.length} OR t.tenant_code ILIKE $${params.length})`; }
  sql += propertyScope(user, 'pay.property_id', params);
  sql += ' ORDER BY COALESCE(pay.paid_at, pay.created_at) DESC LIMIT 2000';
  const { rows } = await query(sql, params);
  return rows.map((r) => numify(r, ['amount', 'months_covered', 'previous_balance', 'remaining_balance', 'monthly_rent']));
}

async function listPending(user) {
  return listPayments(user, { status: 'PENDING' }).then((rows) => rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
}

async function getPaymentRow(id) {
  const { rows } = await query(`${PAYMENT_SELECT} WHERE pay.id = $1`, [id]);
  if (!rows.length) throw new AppError('Payment not found.', 404);
  return rows[0];
}

/** Staff confirms the money really arrived. This is the ONLY way a tenant-submitted payment earns credit. */
async function confirmPayment(paymentId, actor) {
  const pre = await getPaymentRow(paymentId);
  if (!canAccessProperty(actor, pre.property_id)) throw new AppError('You are not assigned to that property.', 403);
  const payment = await withTransaction(async (client) => {
    const lock = await client.query(`SELECT id FROM payments WHERE id = $1 AND status = 'PENDING' FOR UPDATE`, [paymentId]);
    if (!lock.rows.length) throw new AppError('Pending payment not found (it may already have been confirmed or rejected).', 404);
    return applyConfirmedPayment(client, {
      tenantId: pre.tenant_id, amount: pre.amount, type: pre.type, method: pre.method, transactionReference: pre.transaction_reference,
      recordedBy: actor.uid, existingPaymentId: paymentId,
    });
  });
  await writeAudit({ user: actor, action: 'CONFIRM_PAYMENT', entity: 'payments', entityId: paymentId, after: payment });
  await notify({
    toTenantId: pre.tenant_id, title: 'Payment confirmed', type: 'SUCCESS',
    message: `Your payment of ${money(pre.amount)} FCFA was confirmed. Receipt ${payment.receipt_number}.${payment.next_payment_date ? ` Next payment date: ${String(payment.next_payment_date).slice(0, 10)}.` : ''}`,
  });
  return payment;
}

async function rejectPayment(paymentId, reason, actor) {
  const pre = await getPaymentRow(paymentId);
  if (!canAccessProperty(actor, pre.property_id)) throw new AppError('You are not assigned to that property.', 403);
  const { rows } = await query(
    `UPDATE payments SET status = 'FAILED', notes = $1, recorded_by = $2 WHERE id = $3 AND status = 'PENDING' RETURNING *`,
    [`Rejected: ${reason || 'could not be verified'}`, actor.uid, paymentId]
  );
  if (!rows.length) throw new AppError('Pending payment not found (it may already have been confirmed or rejected).', 404);
  await writeAudit({ user: actor, action: 'REJECT_PAYMENT', entity: 'payments', entityId: paymentId, after: rows[0] });
  await notify({
    toTenantId: pre.tenant_id, title: 'Payment not verified', type: 'ERROR',
    message: `We could not verify your ${money(pre.amount)} FCFA payment (${pre.transaction_reference}). ${reason ? `Reason: ${reason}.` : ''} Please contact management.`,
  });
  return rows[0];
}

// ------------------------------------------------------------------ Receipts
async function buildReceipt(paymentId, { tenantId = null, user = null } = {}) {
  const row = await getPaymentRow(paymentId);
  if (tenantId && row.tenant_id !== tenantId) throw new AppError('Receipt not found.', 404); // tenants can only ever see their own
  if (user && !canAccessProperty(user, row.property_id)) throw new AppError('You are not assigned to that property.', 403);
  if (row.status !== 'SUCCESSFUL') throw new AppError('A receipt is only issued once a payment is confirmed.', 400);
  const s = await getSettings();
  return {
    company: { name: s.name, tagline: s.tagline, address: s.address, phone: s.phone, email: s.email, currency: s.currency },
    receiptNumber: row.receipt_number, status: row.status, type: row.type, method: row.method,
    transactionReference: row.transaction_reference, paidAt: row.paid_at, amount: Number(row.amount),
    monthsCovered: row.months_covered !== null ? Number(row.months_covered) : null, periodFrom: row.period_from, periodTo: row.period_to,
    previousBalance: row.previous_balance !== null ? Number(row.previous_balance) : null,
    remainingBalance: row.remaining_balance !== null ? Number(row.remaining_balance) : null, nextPaymentDate: row.next_payment_date,
    tenantName: row.tenant_name, tenantCode: row.tenant_code, propertyName: row.property_name, houseNo: row.house_no, unitNo: row.unit_no,
    categoryName: row.category_name, monthlyRent: Number(row.monthly_rent), authorizedBy: row.authorized_by || 'Management',
  };
}

const d10 = (v) => (v ? String(typeof v === 'string' ? v : new Date(v).toISOString()).slice(0, 10) : '—');

/** Streams a professional A5 PDF receipt (View -> Download -> Print -> Send, spec §6). */
function streamReceiptPdf(r, res) {
  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.receiptNumber}.pdf"`);
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 70).fill('#0e3b34');
  doc.fillColor('#ffffff').fontSize(17).font('Helvetica-Bold').text(r.company.name || 'Property Management', 36, 20, { width: doc.page.width - 72 });
  doc.fontSize(8.5).font('Helvetica').text([r.company.address, r.company.phone].filter(Boolean).join('  •  '), 36, 44, { width: doc.page.width - 72 });

  doc.fillColor('#0e3b34').font('Helvetica-Bold').fontSize(13).text('RENT PAYMENT RECEIPT', 36, 86);
  doc.fillColor('#555').font('Helvetica').fontSize(9).text(`Receipt No: ${r.receiptNumber}      Date: ${d10(r.paidAt)}`, 36, 104);

  const rows = [
    ['Tenant', `${r.tenantName}  (${r.tenantCode})`],
    ['Property', r.propertyName],
    ['House / Unit', `House ${r.houseNo} • Unit ${r.unitNo}${r.categoryName ? ` • ${r.categoryName}` : ''}`],
    ['Payment type', r.type === 'RENT' ? 'Rent' : r.type === 'DEPOSIT' ? 'Security deposit' : 'Other'],
    ['Amount paid', `${money(r.amount)} ${r.company.currency || 'FCFA'}`],
    ...(r.type === 'RENT' ? [
      ['Months covered', r.monthsCovered !== null ? String(r.monthsCovered) : '—'],
      ['Period covered', `${d10(r.periodFrom)}  to  ${d10(r.periodTo)}`],
      ['Previous balance', `${money(r.previousBalance)} ${r.company.currency || 'FCFA'}`],
      ['Remaining balance', `${money(r.remainingBalance)} ${r.company.currency || 'FCFA'}`],
      ['Next payment date', d10(r.nextPaymentDate)],
    ] : []),
    ['Method', String(r.method).replace(/_/g, ' ')],
    ['Reference', r.transactionReference],
    ['Status', 'CONFIRMED'],
  ];
  let y = 130;
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) doc.rect(36, y - 3, doc.page.width - 72, 18).fill('#f2f6f5');
    doc.fillColor('#555').font('Helvetica-Bold').fontSize(9).text(k, 44, y, { width: 110 });
    doc.fillColor('#111').font('Helvetica').fontSize(9.5).text(String(v ?? '—'), 160, y, { width: doc.page.width - 200 });
    y += 18;
  });
  y += 14;
  doc.fillColor('#555').font('Helvetica').fontSize(8.5).text(`Authorized by: ${r.authorizedBy}`, 36, y);
  doc.fontSize(7.5).fillColor('#888').text('This is a computer-generated receipt. Keep it as proof of payment.', 36, y + 16, { width: doc.page.width - 72 });
  doc.end();
}

module.exports = {
  METHODS, applyConfirmedPayment, recordOfficePayment, submitTenantPayment, listPayments, listPending,
  confirmPayment, rejectPayment, buildReceipt, streamReceiptPdf, refFor,
};
