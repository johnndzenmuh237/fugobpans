const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { computeInvoiceStatus } = require('../utils/calculations');
const { nextId } = require('../utils/idGenerator');

/** Creates an invoice for a student from a fee structure. */
async function createInvoiceForStudent(client, { studentId, feeStructureId }) {
  const { rows } = await client.query('SELECT total FROM fee_structures WHERE id = $1', [feeStructureId]);
  if (!rows.length) throw new AppError('Fee structure not found.');
  const invoiceNumber = await nextId('INV');
  const { rows: inv } = await client.query(
    `INSERT INTO invoices (invoice_number, student_id, fee_structure_id, total_amount, amount_paid, status)
     VALUES ($1,$2,$3,$4,0,'UNPAID') RETURNING *`,
    [invoiceNumber, studentId, feeStructureId, rows[0].total]
  );
  return inv[0];
}

/**
 * THE single place any payment — online (Campay/MTN/Orange) or office
 * (cash/other) — is ever applied to an invoice. Runs inside one SQL
 * transaction so the invoice total and the payment ledger row always
 * move together (spec §27, §83). Idempotent: transaction_reference has
 * a UNIQUE constraint, so a duplicate webhook delivery or double office
 * entry is caught here rather than double-crediting the account (spec §87).
 */
async function applyPayment({ invoiceId, amount, method, transactionReference, recordedBy = null, notes = null }) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM payments WHERE transaction_reference = $1', [transactionReference]);
    if (existing.rows.length) {
      return { alreadyApplied: true, payment: existing.rows[0] };
    }

    const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
    if (!invRes.rows.length) throw new AppError('Invoice not found.');
    const invoice = invRes.rows[0];

    const newPaid = Number(invoice.amount_paid) + Number(amount);
    const newStatus = computeInvoiceStatus(invoice.total_amount, newPaid);
    const receiptNumber = await nextId('REC');

    const payRes = await client.query(
      `INSERT INTO payments (receipt_number, invoice_id, student_id, amount, method, transaction_reference, status, recorded_by, notes, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,'SUCCESSFUL',$7,$8, now()) RETURNING *`,
      [receiptNumber, invoiceId, invoice.student_id, amount, method, transactionReference, recordedBy, notes]
    );

    await client.query('UPDATE invoices SET amount_paid = $1, status = $2, updated_at = now() WHERE id = $3', [newPaid, newStatus, invoiceId]);

    return { alreadyApplied: false, payment: payRes.rows[0], invoice: { ...invoice, amount_paid: newPaid, status: newStatus } };
  });
}

async function listInvoicesForStudent(studentId) {
  const { rows } = await query('SELECT * FROM invoices WHERE student_id = $1 ORDER BY created_at DESC', [studentId]);
  return rows;
}

async function getInvoice(id) {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (!rows.length) throw new AppError('Invoice not found.', 404);
  return rows[0];
}

module.exports = { createInvoiceForStudent, applyPayment, listInvoicesForStudent, getInvoice };
