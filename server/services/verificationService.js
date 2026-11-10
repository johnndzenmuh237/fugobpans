/**
 * Payment verification workflow + permanent history (additions #1 and the foundation for #2, #4).
 *
 * RULES
 *  - A screenshot + transaction ID NEVER credits an invoice. It creates a PENDING payment.
 *  - Only verifyPayment() (a person with the "approve_payments" permission) turns PENDING into SUCCESSFUL, and that
 *    is the only place the invoice balance moves for these payments. Same transaction, rows locked.
 *  - Every step (submitted, info requested, verified, rejected, recorded, gateway-confirmed) writes an
 *    append-only history row naming the person, their role, the time and their IP address.
 *  - transaction_reference is UNIQUE, so the same Mobile Money transaction ID can't be submitted twice.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');
const { computeInvoiceStatus } = require('../utils/calculations');
const { addHistory, clientIp, normTx } = require('../utils/paymentHistory');
const { last9 } = require('../utils/phone');
const { notify } = require('./notificationService');
const messaging = require('./messagingService');
const { getSchoolInfo } = require('./schoolInfo');

const PROVIDERS = { MTN: 'MTN_MOMO', MTN_MOMO: 'MTN_MOMO', ORANGE: 'ORANGE_MONEY', ORANGE_MONEY: 'ORANGE_MONEY' };
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const money = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');

// ------------------------------------------------------------ evidence (secure upload)
/** Accepts a data URL, checks the REAL file type from its first bytes (never trusts the declared type), size-limits it. */
function parseEvidence(dataUrl) {
  const m = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new AppError('Please attach your payment screenshot as a JPG, PNG or WEBP image.');
  const buf = Buffer.from(m[1].replace(/\s/g, ''), 'base64');
  if (buf.length < 2048) throw new AppError('That image is too small to be a payment screenshot. Please attach the full screenshot.');
  if (buf.length > MAX_EVIDENCE_BYTES) throw new AppError('The screenshot is larger than 4 MB. Please choose a smaller image.');
  let mime = null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) mime = 'image/jpeg';
  else if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) mime = 'image/png';
  else if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') mime = 'image/webp';
  if (!mime) throw new AppError('That file is not a valid JPG, PNG or WEBP image.');
  return { buf, mime, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

// ------------------------------------------------------------ portal access tokens (used when OTP verification is switched on)
const portalSecret = () => process.env.JWT_SECRET || '';
function issuePortalToken(studentId) { return jwt.sign({ typ: 'portal', sid: studentId }, portalSecret(), { expiresIn: '30m' }); }
function portalTokenStudentId(token) {
  try { const d = jwt.verify(String(token || ''), portalSecret()); return d.typ === 'portal' ? d.sid : null; } catch { return null; }
}

async function guardianNotice(student, text) {
  const s = await messaging.getMessagingSettings().catch(() => null);
  const channel = s?.channel === 'WHATSAPP' ? 'WHATSAPP' : 'SMS';
  const to = channel === 'WHATSAPP' ? (student.guardian_whatsapp || student.guardian_phone) : student.guardian_phone;
  return messaging.sendMessage({ kind: 'NOTICE', channel, to, body: text, studentId: student.id });
}

// ------------------------------------------------------------ 1. student/parent submits evidence (PUBLIC)
async function submitPublicPayment(body, req) {
  const { trackingCode, provider, transactionId, payerPhone, amount, evidence, invoiceId, accessToken } = body || {};
  const method = PROVIDERS[String(provider || '').toUpperCase()];
  if (!method) throw new AppError('Please choose MTN Mobile Money or Orange Money.');
  const txRef = String(transactionId || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{5,39}$/.test(txRef)) throw new AppError('Enter the transaction ID exactly as it appears in your Mobile Money confirmation (6–40 letters/numbers).');
  if (!last9(payerPhone)) throw new AppError('Enter the phone number you paid from.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 100000000) throw new AppError('Enter the amount you transferred.');
  const ev = parseEvidence(evidence);

  const { rows: sRows } = await query(
    `SELECT s.id, s.first_name, s.last_name, s.guardian_name, s.guardian_phone, s.guardian_whatsapp, s.status, s.tracking_code, c.name AS class_name
     FROM students s JOIN classes c ON c.id = s.class_id WHERE s.tracking_code = $1`, [String(trackingCode || '').trim().toUpperCase()]);
  const student = sRows[0];
  if (!student || student.status !== 'ACTIVE') throw new AppError('No active student record matches that tracking code.', 404);

  const ms = await messaging.getMessagingSettings().catch(() => null);
  if (ms?.require_otp_for_lookup && portalTokenStudentId(accessToken) !== student.id) {
    throw new AppError('Please verify your identity with the code sent to the guardian\'s phone first.', 401);
  }

  const { rows: invs } = await query('SELECT * FROM invoices WHERE student_id = $1 AND balance > 0 ORDER BY created_at DESC', [student.id]);
  const invoice = invoiceId ? invs.find((i) => i.id === invoiceId) : invs[0];
  if (!invoice) throw new AppError(invs.length ? 'That invoice was not found.' : 'This student has no outstanding balance — nothing to pay.');
  if (amt > Number(invoice.balance)) throw new AppError(`The amount is more than the outstanding balance (${money(invoice.balance)} FCFA). Enter the amount you actually paid, up to the balance.`);

  const { rows: waiting } = await query(`SELECT count(*)::int AS n FROM payments WHERE student_id = $1 AND status = 'PENDING'`, [student.id]);
  if (waiting[0].n >= 3) throw new AppError('Three payments are already waiting to be verified for this student. Please wait for the school to confirm them, or call the school office.');

  let payment;
  try {
    payment = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO payments (invoice_id, student_id, amount, method, transaction_reference, status, notes, submitted_by_public, payer_phone)
         VALUES ($1,$2,$3,$4,$5,'PENDING',$6,true,$7) RETURNING *`,
        [invoice.id, student.id, amt, method, txRef, `Submitted online by ${student.guardian_name || 'guardian'}`, String(payerPhone).trim().slice(0, 30)]);
      const p = rows[0];
      await client.query('INSERT INTO payment_evidence (payment_id, mime, size_bytes, sha256, data) VALUES ($1,$2,$3,$4,$5)', [p.id, ev.mime, ev.buf.length, ev.sha256, ev.buf]);
      const { rows: dup } = await client.query('SELECT payment_id FROM payment_evidence WHERE sha256 = $1 AND payment_id <> $2 LIMIT 1', [ev.sha256, p.id]);
      await addHistory(client, { paymentId: p.id, event: 'SUBMITTED', toStatus: 'PENDING', amount: amt, actor: { name: `${student.guardian_name || 'Guardian'} (online submission)`, role: 'PUBLIC' }, ip: clientIp(req),
        note: `${method.replace('_', ' ')} · ID ${txRef} · from ${payerPhone}` });
      if (dup.length) await addHistory(client, { paymentId: p.id, event: 'FLAGGED', actor: null, note: 'The same screenshot file was already attached to another payment.', ip: clientIp(req) });
      return p;
    });
  } catch (e) {
    if (e.code === '23505') {
      await writeAudit({ user: null, action: 'DUPLICATE_TRANSACTION_ATTEMPT', entity: 'payments', after: { transactionId: txRef, studentId: student.id }, req }).catch(() => {});
      throw new AppError('That transaction ID has already been submitted. If you believe this is a mistake, please call the school office.');
    }
    throw e;
  }
  await notify({ toRole: 'MANAGER', title: 'Payment waiting for verification', type: 'WARNING', link: '/admin/pending-payments.html', department: 'Finance', entity: 'payments', entityId: payment.id,
    message: `${student.first_name} ${student.last_name} (${student.class_name}) submitted ${money(amt)} FCFA via ${method.replace('_', ' ')} — ID ${txRef}.` });
  return { id: payment.id, status: 'PENDING', message: 'Payment received for verification. It is NOT confirmed yet — the school will confirm once the money is seen on its account.' };
}

// ------------------------------------------------------------ 2. queue + detail
const norm = `upper(regexp_replace(p.transaction_reference, '[^A-Za-z0-9]', '', 'g'))`;
async function listPending() {
  const { rows } = await query(
    `SELECT p.id, p.amount, p.method, p.transaction_reference, p.payer_phone, p.created_at, p.notes, p.submitted_by_public,
            s.id AS student_id, s.first_name, s.last_name, s.tracking_code, s.student_code, s.guardian_name, s.guardian_phone, c.name AS class_name,
            i.invoice_number, i.total_amount, i.amount_paid, i.balance,
            EXISTS (SELECT 1 FROM payment_evidence e WHERE e.payment_id = p.id) AS has_evidence,
            (SELECT count(*)::int FROM payment_verification_history h WHERE h.payment_id = p.id AND h.event = 'INFO_REQUESTED') AS info_requests,
            (SELECT count(*)::int FROM payment_verification_history h WHERE h.payment_id = p.id AND h.event = 'FLAGGED') AS flags,
            (SELECT json_build_object('amount', l.amount, 'tx_time', l.tx_time) FROM statement_lines l WHERE l.provider = p.method::text AND l.tx_id_norm = ${norm} LIMIT 1) AS statement_line
     FROM payments p JOIN students s ON s.id = p.student_id JOIN classes c ON c.id = s.class_id JOIN invoices i ON i.id = p.invoice_id
     WHERE p.status = 'PENDING' ORDER BY p.created_at ASC LIMIT 500`);
  return rows.map((r) => ({ ...r, amount: Number(r.amount), total_amount: Number(r.total_amount), amount_paid: Number(r.amount_paid), balance: Number(r.balance) }));
}

async function getEvidence(paymentId) {
  const { rows } = await query('SELECT mime, data FROM payment_evidence WHERE payment_id = $1 ORDER BY uploaded_at DESC LIMIT 1', [paymentId]);
  if (!rows.length) throw new AppError('No screenshot was attached to this payment.', 404);
  return rows[0];
}

async function paymentHistory(paymentId) {
  const { rows } = await query('SELECT id, event, from_status, to_status, amount, receipt_number, actor_name, actor_role, note, ip, created_at FROM payment_verification_history WHERE payment_id = $1 ORDER BY created_at, id', [paymentId]);
  return rows.map((r) => ({ ...r, amount: r.amount === null ? null : Number(r.amount) }));
}

/** Everyone's decisions, filterable — the evidence the owner uses to settle a dispute. */
async function listHistory({ from, to, actorId, event, q, limit } = {}) {
  const params = [];
  let sql = `SELECT h.id, h.payment_id, h.event, h.from_status, h.to_status, h.amount, h.receipt_number, h.actor_id, h.actor_name, h.actor_role, h.note, h.ip, h.created_at,
                    p.transaction_reference, p.method, s.first_name, s.last_name, s.student_code
             FROM payment_verification_history h JOIN payments p ON p.id = h.payment_id JOIN students s ON s.id = p.student_id WHERE 1=1`;
  if (from) { params.push(from); sql += ` AND h.created_at >= $${params.length}::date`; }
  if (to) { params.push(to); sql += ` AND h.created_at < ($${params.length}::date + 1)`; }
  if (actorId) { params.push(actorId); sql += ` AND h.actor_id = $${params.length}`; }
  if (event) { params.push(event); sql += ` AND h.event = $${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (p.transaction_reference ILIKE $${params.length} OR s.first_name || ' ' || s.last_name ILIKE $${params.length} OR s.student_code ILIKE $${params.length} OR h.receipt_number ILIKE $${params.length})`; }
  params.push(Math.min(Number(limit) || 300, 1000));
  sql += ` ORDER BY h.created_at DESC LIMIT $${params.length}`;
  const { rows } = await query(sql, params);
  return rows.map((r) => ({ ...r, amount: r.amount === null ? null : Number(r.amount) }));
}

// ------------------------------------------------------------ 3. decisions
async function loadPendingForUpdate(client, paymentId) {
  const { rows } = await client.query(`SELECT * FROM payments WHERE id = $1 AND status = 'PENDING' FOR UPDATE`, [paymentId]);
  if (!rows.length) throw new AppError('This payment is no longer waiting for verification (someone may already have decided it).', 409);
  return rows[0];
}
async function studentOf(paymentId) {
  const { rows } = await query(`SELECT s.id, s.first_name, s.last_name, s.guardian_name, s.guardian_phone, s.guardian_whatsapp FROM payments p JOIN students s ON s.id = p.student_id WHERE p.id = $1`, [paymentId]);
  return rows[0];
}

/** The ONLY way a submitted payment earns credit. `confirmedAmount` lets the verifier fix a mistyped amount to what really arrived. */
async function verifyPayment(paymentId, actor, { note, confirmedAmount } = {}, req = null) {
  const result = await withTransaction(async (client) => {
    const pay = await loadPendingForUpdate(client, paymentId);
    const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [pay.invoice_id]);
    const invoice = invRes.rows[0];
    let amount = Number(pay.amount);
    let correction = '';
    if (confirmedAmount !== undefined && confirmedAmount !== null && confirmedAmount !== '') {
      const c = Number(confirmedAmount);
      if (!(c > 0)) throw new AppError('The confirmed amount must be more than zero.');
      if (c !== amount) { correction = ` Amount corrected from ${money(amount)} to ${money(c)} FCFA by the verifier.`; amount = c; }
    }
    if (amount > Number(invoice.balance)) throw new AppError(`This amount (${money(amount)} FCFA) is more than the invoice balance (${money(invoice.balance)} FCFA). Correct the amount or reject the payment.`);
    const newPaid = Number(invoice.amount_paid) + amount;
    const status = computeInvoiceStatus(invoice.total_amount, newPaid);
    const receiptNumber = await nextId('REC');
    const { rows } = await client.query(
      `UPDATE payments SET status = 'SUCCESSFUL', amount = $1, receipt_number = $2, paid_at = now(), recorded_by = $3, verified_by = $3, verified_at = now() WHERE id = $4 RETURNING *`,
      [amount, receiptNumber, actor.uid, paymentId]);
    await client.query('UPDATE invoices SET amount_paid = $1, status = $2, updated_at = now() WHERE id = $3', [newPaid, status, invoice.id]);
    await addHistory(client, { paymentId, event: 'VERIFIED', fromStatus: 'PENDING', toStatus: 'SUCCESSFUL', amount, receiptNumber, actor, ip: clientIp(req),
      note: `${note ? `${note}.` : 'Money confirmed received.'}${correction}` });
    return { payment: rows[0], invoice: { ...invoice, amount_paid: newPaid, status }, receiptNumber, amount };
  });
  await writeAudit({ user: actor, action: 'VERIFY_PAYMENT', entity: 'payments', entityId: paymentId, after: { receipt: result.receiptNumber, amount: result.amount }, req }).catch(() => {});
  const st = await studentOf(paymentId);
  const school = await getSchoolInfo();
  if (st) await guardianNotice(st, `${school.name}: we confirmed your payment of ${money(result.amount)} FCFA for ${st.first_name}. Receipt ${result.receiptNumber}. Balance: ${money(Number(result.invoice.total_amount) - Number(result.invoice.amount_paid))} FCFA.`);
  return result.payment;
}

async function rejectPayment(paymentId, actor, reason, req = null) {
  const why = String(reason || '').trim();
  if (why.length < 5) throw new AppError('Please write the reason (at least a few words) — the family will be told.');
  const payment = await withTransaction(async (client) => {
    const pay = await loadPendingForUpdate(client, paymentId);
    const { rows } = await client.query(
      `UPDATE payments SET status = 'FAILED', rejection_reason = $1, recorded_by = $2, verified_by = $2, verified_at = now(), notes = $3 WHERE id = $4 RETURNING *`,
      [why.slice(0, 300), actor.uid, `Rejected: ${why}`.slice(0, 300), paymentId]);
    await addHistory(client, { paymentId, event: 'REJECTED', fromStatus: 'PENDING', toStatus: 'FAILED', amount: pay.amount, actor, ip: clientIp(req), note: why });
    return rows[0];
  });
  await writeAudit({ user: actor, action: 'REJECT_PAYMENT', entity: 'payments', entityId: paymentId, after: { reason: why }, req }).catch(() => {});
  const st = await studentOf(paymentId);
  const school = await getSchoolInfo();
  if (st) await guardianNotice(st, `${school.name}: we could not confirm your payment of ${money(payment.amount)} FCFA (ID ${payment.transaction_reference}). Reason: ${why}. Please call ${school.phone || 'the school office'}.`);
  return payment;
}

async function requestInfo(paymentId, actor, message, req = null) {
  const msg = String(message || '').trim();
  if (msg.length < 5) throw new AppError('Write what the family should send or correct.');
  await withTransaction(async (client) => {
    await loadPendingForUpdate(client, paymentId);
    await addHistory(client, { paymentId, event: 'INFO_REQUESTED', fromStatus: 'PENDING', toStatus: 'PENDING', actor, ip: clientIp(req), note: msg });
  });
  const st = await studentOf(paymentId);
  const school = await getSchoolInfo();
  let delivered = 'not_attempted';
  if (st) delivered = (await guardianNotice(st, `${school.name}: about your payment for ${st.first_name} — ${msg} Please call ${school.phone || 'the school office'}.`)).status;
  return { ok: true, messageStatus: delivered };
}

module.exports = {
  PROVIDERS, parseEvidence, issuePortalToken, portalTokenStudentId, submitPublicPayment,
  listPending, getEvidence, paymentHistory, listHistory, verifyPayment, rejectPayment, requestInfo,
};
