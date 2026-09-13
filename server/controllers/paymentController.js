const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { initiateCollection, checkTransactionStatus, mapMethod } = require('../services/paymentGatewayService');
const { applyPayment, getInvoice } = require('../services/invoiceService');
const { notify } = require('../services/notificationService');
const { writeAudit } = require('../utils/auditLogger');

/** PUBLIC — starts a Mobile Money prompt. Does NOT touch the invoice yet. */
const createOnlinePayment = asyncHandler(async (req, res) => {
  const { invoiceId, amount, phone } = req.body;
  if (!invoiceId || !amount || !phone) throw new AppError('invoiceId, amount and phone are required.');
  await getInvoice(invoiceId); // 404s if it doesn't exist

  const externalReference = `PAY-${invoiceId}-${Date.now()}`;
  const { providerReference } = await initiateCollection({ amount, phone, externalReference, description: `School fee payment` });
  res.status(202).json({ status: 'PENDING', providerReference, externalReference, message: 'Approve the prompt sent to your phone to complete payment.' });
});

/** Frontend polling — convenience only; re-verifies with Campay before ever applying anything. */
const verifyOnlinePayment = asyncHandler(async (req, res) => {
  const { invoiceId } = req.query;
  const status = await checkTransactionStatus(req.params.providerReference);
  if (status.status === 'SUCCESSFUL' && invoiceId) {
    const result = await applyPayment({
      invoiceId, amount: status.amount, method: mapMethod(status.operator), transactionReference: status.reference,
    });
    return res.json({ status: 'SUCCESSFUL', ...result });
  }
  res.json({ status: status.status });
});

/**
 * Campay webhook — server-to-server. Never trusts the POST body's status
 * field; re-fetches the real status from Campay before writing anything.
 * applyPayment() is idempotent (UNIQUE transaction_reference), so
 * redelivered webhooks never double-credit an invoice (spec §87).
 */
const webhook = asyncHandler(async (req, res) => {
  const reference = req.body.reference || req.body.data?.reference;
  if (!reference) return res.status(400).json({ error: 'Missing reference.' });

  const status = await checkTransactionStatus(reference);
  if (status.status !== 'SUCCESSFUL') return res.status(200).json({ received: true, status: status.status });

  const invoiceId = (status.externalReference || '').split('-')[1];
  if (!invoiceId) return res.status(200).json({ received: true, warning: 'No invoice reference on transaction.' });

  const result = await applyPayment({ invoiceId, amount: status.amount, method: mapMethod(status.operator), transactionReference: status.reference });

  if (!result.alreadyApplied) {
    const studentRes = await query('SELECT first_name, last_name FROM students WHERE id = $1', [result.invoice.student_id]);
    const student = studentRes.rows[0];
    await notify({
      toRole: 'MANAGER',
      title: 'Online payment received',
      message: `${student?.first_name || ''} ${student?.last_name || ''} paid ${Number(result.payment.amount).toLocaleString()} FCFA via ${mapMethod(status.operator).replace('_', ' ')}. New status: ${result.invoice.status}.`,
      type: 'SUCCESS',
    });
    await writeAudit({ user: null, action: 'PAYMENT_VERIFIED_WEBHOOK', entity: 'payments', entityId: result.payment.id, after: result.payment });
  }
  res.status(200).json({ received: true, applied: !result.alreadyApplied });
});

/** Accountant/Manager records a payment made physically at the office (spec §26, §27). */
const recordOfficePayment = asyncHandler(async (req, res) => {
  const { invoiceId, amount, method, notes } = req.body;
  if (!invoiceId || !amount) throw new AppError('invoiceId and amount are required.');
  const transactionReference = `OFFICE-${invoiceId}-${Date.now()}`;

  const result = await applyPayment({
    invoiceId, amount, method: method || 'OFFICE_CASH', transactionReference, recordedBy: req.user.uid, notes,
  });
  await writeAudit({ user: req.user, action: 'RECORD_OFFICE_PAYMENT', entity: 'payments', entityId: result.payment.id, after: result.payment, req });
  res.status(201).json(result);
});

const listPayments = asyncHandler(async (req, res) => {
  const { studentId, invoiceId } = req.query;
  let sql = 'SELECT * FROM payments WHERE 1=1';
  const params = [];
  if (studentId) { params.push(studentId); sql += ` AND student_id = $${params.length}`; }
  if (invoiceId) { params.push(invoiceId); sql += ` AND invoice_id = $${params.length}`; }
  sql += ' ORDER BY created_at DESC LIMIT 1000';
  const { rows } = await query(sql, params);
  res.json(rows);
});

module.exports = { createOnlinePayment, verifyOnlinePayment, webhook, recordOfficePayment, listPayments };
