/**
 * Financial reconciliation (addition #4): compare what the school RECORDED against what MTN / Orange say they PAID IN.
 *
 * Reality check: neither operator offers a public "look up this transaction" API to a school without a
 * merchant agreement. So the dependable method is importing the CSV statement the operator's merchant portal
 * lets you download. A future live API feed can write into statement_lines through the same table (the report doesn't care
 * where a line came from) — that is the seam left for official MTN / Orange API integration.
 *
 * Findings:
 *   MATCHED                same transaction ID, same amount
 *   AMOUNT_MISMATCH        same ID, different amount (typo, or someone altered a figure)
 *   UNRECORDED             money in the statement with NO payment in the system (a parent paid but never submitted proof)
 *   PENDING_VERIFICATION   statement proves the money exists for a payment still waiting for a manager
 *   REJECTED_BUT_RECEIVED  statement shows money for a payment that was rejected — needs a human look
 *   NOT_IN_STATEMENT       a payment recorded as SUCCESSFUL that does not appear in the operator's statement
 */
const crypto = require('crypto');
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');
const { parseStatement, normTx, classifyLine } = require('../utils/statementParser');

const PROVIDERS = ['MTN_MOMO', 'ORANGE_MONEY'];
const NORM_SQL = `upper(regexp_replace(p.transaction_reference, '[^A-Za-z0-9]', '', 'g'))`;
const num = (v) => Number(v || 0);

async function importStatement({ provider, filename, content }, actor, req) {
  if (!PROVIDERS.includes(provider)) throw new AppError('Choose MTN Mobile Money or Orange Money.');
  if (typeof content !== 'string' || content.length < 20) throw new AppError('The file is empty.');
  const parsed = parseStatement(content);
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  const result = await withTransaction(async (client) => {
    const dup = await client.query('SELECT id, imported_at FROM statement_imports WHERE provider = $1 AND file_sha256 = $2', [provider, sha]);
    if (dup.rows.length) throw new AppError('This exact file was already imported.', 409);
    const imp = (await client.query(
      `INSERT INTO statement_imports (provider, filename, file_sha256, rows_read, imported_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [provider, String(filename || '').slice(0, 200), sha, parsed.lines.length + parsed.skipped, actor.uid])).rows[0];
    let added = 0;
    for (const l of parsed.lines) {
      const r = await client.query(
        `INSERT INTO statement_lines (import_id, provider, tx_id, tx_id_norm, amount, tx_time, counterparty, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (provider, tx_id_norm) DO NOTHING`,
        [imp.id, provider, l.txId.slice(0, 80), l.txIdNorm.slice(0, 80), l.amount, l.txTime, l.party, JSON.stringify(l.raw)]);
      added += r.rowCount;
    }
    await client.query('UPDATE statement_imports SET rows_added = $1, rows_skipped = $2 WHERE id = $3', [added, parsed.lines.length - added + parsed.skipped, imp.id]);
    return { importId: imp.id, rowsRead: parsed.lines.length + parsed.skipped, rowsAdded: added, rowsSkipped: parsed.lines.length - added + parsed.skipped };
  });
  await writeAudit({ user: actor, action: 'IMPORT_MOMO_STATEMENT', entity: 'statement_imports', entityId: result.importId, after: { provider, filename, ...result }, req }).catch(() => {});
  return result;
}

async function listImports() {
  const { rows } = await query(
    `SELECT i.id, i.provider, i.filename, i.rows_read, i.rows_added, i.rows_skipped, i.imported_at, u.name AS imported_by_name,
            (SELECT min(tx_time) FROM statement_lines l WHERE l.import_id = i.id) AS first_tx, (SELECT max(tx_time) FROM statement_lines l WHERE l.import_id = i.id) AS last_tx
     FROM statement_imports i LEFT JOIN users u ON u.id = i.imported_by ORDER BY i.imported_at DESC LIMIT 100`);
  return rows;
}

async function report({ provider, from, to }) {
  if (!PROVIDERS.includes(provider)) throw new AppError('Choose MTN Mobile Money or Orange Money.');
  const dFrom = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : null;
  const dTo = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : null;

  const { rows: lines } = await query(
    `SELECT id, tx_id, tx_id_norm, amount, tx_time, counterparty FROM statement_lines
     WHERE provider = $1 AND ($2::date IS NULL OR tx_time >= $2::date) AND ($3::date IS NULL OR tx_time < $3::date + 1) ORDER BY tx_time DESC NULLS LAST LIMIT 5000`, [provider, dFrom, dTo]);
  if (!lines.length) return { provider, coverage: null, summary: null, lines: [], missing: [], note: 'No statement lines for this period. Import the statement first.' };
  const times = lines.map((l) => l.tx_time).filter(Boolean).map((t) => new Date(t).getTime());
  const coverage = times.length ? { from: new Date(Math.min(...times)).toISOString(), to: new Date(Math.max(...times)).toISOString() } : null;

  const payCols = `p.id, p.receipt_number, p.amount, p.status, p.transaction_reference, p.paid_at, p.created_at, p.payer_phone, s.first_name, s.last_name, s.student_code,
                   (SELECT h.actor_name FROM payment_verification_history h WHERE h.payment_id = p.id AND h.event IN ('VERIFIED','RECORDED','GATEWAY_CONFIRMED') ORDER BY h.created_at DESC LIMIT 1) AS verified_by`;
  const { rows: pays } = await query(
    `SELECT ${payCols}, ${NORM_SQL} AS norm FROM payments p JOIN students s ON s.id = p.student_id
     WHERE p.method::text = $1 AND ${NORM_SQL} = ANY($2)`, [provider, lines.map((l) => l.tx_id_norm)]);
  const payByNorm = new Map(pays.map((p) => [p.norm, p]));

  let missingRows = [];
  if (coverage) {
    const { rows } = await query(
      `SELECT ${payCols}, ${NORM_SQL} AS norm FROM payments p JOIN students s ON s.id = p.student_id
       WHERE p.method::text = $1 AND p.status = 'SUCCESSFUL' AND p.paid_at BETWEEN $2 AND $3 ORDER BY p.paid_at DESC LIMIT 5000`, [provider, coverage.from, coverage.to]);
    if (rows.length) {
      const { rows: have } = await query('SELECT tx_id_norm FROM statement_lines WHERE provider = $1 AND tx_id_norm = ANY($2)', [provider, rows.map((r) => r.norm)]);
      const haveSet = new Set(have.map((h) => h.tx_id_norm));
      missingRows = rows.filter((r) => !haveSet.has(r.norm));
    }
  }

  const { rows: res } = await query(
    `SELECT DISTINCT ON (COALESCE(payment_id::text, '') || COALESCE(line_id::text, '')) payment_id, line_id, outcome, note, resolved_by_name, resolved_at
     FROM reconciliation_resolutions ORDER BY COALESCE(payment_id::text, '') || COALESCE(line_id::text, ''), resolved_at DESC`);
  const resByLine = new Map(res.filter((r) => r.line_id).map((r) => [r.line_id, r]));
  const resByPay = new Map(res.filter((r) => r.payment_id).map((r) => [r.payment_id, r]));

  const outLines = lines.map((l) => {
    const p = payByNorm.get(l.tx_id_norm) || null;
    const status = classifyLine(l, p);
    return { lineId: l.id, txId: l.tx_id, amount: num(l.amount), txTime: l.tx_time, counterparty: l.counterparty, status,
      payment: p && { id: p.id, amount: num(p.amount), status: p.status, receipt: p.receipt_number, student: `${p.first_name} ${p.last_name}`, studentCode: p.student_code, verifiedBy: p.verified_by },
      resolution: resByLine.get(l.id) || (p && resByPay.get(p.id)) || null };
  });
  const missing = missingRows.map((p) => ({ noRealId: /^OFFICE-/.test(p.transaction_reference), paymentId: p.id, txId: p.transaction_reference, amount: num(p.amount), paidAt: p.paid_at, receipt: p.receipt_number, student: `${p.first_name} ${p.last_name}`, studentCode: p.student_code, verifiedBy: p.verified_by, resolution: resByPay.get(p.id) || null }));

  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const by = (st) => outLines.filter((l) => l.status === st);
  const open = (arr) => arr.filter((x) => !x.resolution);
  const summary = {
    statementLines: outLines.length, statementTotal: sum(outLines, (l) => l.amount),
    matched: by('MATCHED').length, matchedTotal: sum(by('MATCHED'), (l) => l.amount),
    amountMismatch: open(by('AMOUNT_MISMATCH')).length,
    unrecorded: open(by('UNRECORDED')).length, unrecordedTotal: sum(open(by('UNRECORDED')), (l) => l.amount),
    pendingVerification: by('PENDING_VERIFICATION').length,
    rejectedButReceived: open(by('REJECTED_BUT_RECEIVED')).length,
    notInStatement: open(missing).length, notInStatementTotal: sum(open(missing), (m) => m.amount),
  };
  summary.clean = !summary.amountMismatch && !summary.unrecorded && !summary.rejectedButReceived && !summary.notInStatement;
  return { provider, coverage, summary, lines: outLines, missing };
}

async function resolve({ paymentId, lineId, outcome, note }, actor, req) {
  if (!['MATCHED_MANUALLY', 'ACCEPTED_DIFFERENCE', 'INVESTIGATED', 'WRITTEN_OFF'].includes(outcome)) throw new AppError('Choose an outcome.');
  if (!paymentId && !lineId) throw new AppError('Nothing to resolve.');
  if (outcome === 'MATCHED_MANUALLY' && !(paymentId && lineId)) throw new AppError('Matching by hand needs both the payment and the statement line.');
  const why = String(note || '').trim();
  if (why.length < 5) throw new AppError('Write a note explaining the decision — it is kept permanently.');
  if (paymentId && !(await query('SELECT 1 FROM payments WHERE id = $1', [paymentId])).rows.length) throw new AppError('Payment not found.', 404);
  if (lineId && !(await query('SELECT 1 FROM statement_lines WHERE id = $1', [lineId])).rows.length) throw new AppError('Statement line not found.', 404);
  const { rows } = await query(
    `INSERT INTO reconciliation_resolutions (payment_id, line_id, outcome, note, resolved_by, resolved_by_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [paymentId || null, lineId || null, outcome, why.slice(0, 500), actor.uid, actor.name]);
  await writeAudit({ user: actor, action: 'RECONCILIATION_RESOLVE', entity: 'payments', entityId: paymentId || null, after: { lineId, outcome, note: why }, req }).catch(() => {});
  return rows[0];
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function toCsv(rep) {
  const head = ['Finding', 'Transaction ID', 'Statement amount', 'Recorded amount', 'Student', 'Receipt', 'Verified by', 'Resolution'];
  const rows = [
    ...rep.lines.filter((l) => l.status !== 'MATCHED').map((l) => [l.status, l.txId, l.amount, l.payment?.amount ?? '', l.payment?.student ?? '', l.payment?.receipt ?? '', l.payment?.verifiedBy ?? '', l.resolution ? `${l.resolution.outcome}: ${l.resolution.note}` : '']),
    ...rep.missing.map((m) => ['NOT_IN_STATEMENT', m.txId, '', m.amount, m.student, m.receipt ?? '', m.verifiedBy ?? '', m.resolution ? `${m.resolution.outcome}: ${m.resolution.note}` : '']),
  ];
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

module.exports = { PROVIDERS, importStatement, listImports, report, resolve, toCsv, normTx };
