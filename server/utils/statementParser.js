/**
 * Turns an MTN MoMo / Orange Money statement export (CSV) into normalised credit lines.
 * Column names differ between exports and over time, so columns are found by a list of known names (English + French).
 * If the file has no transaction-ID and amount columns we say so and list the headers we saw — we never guess.
 */
const { parseCsvObjects } = require('./csv');

const ALIASES = {
  txId: ['financial transaction id', 'transaction id', 'transactionid', 'trans id', 'txn id', 'transaction reference', 'transaction ref', 'external id', 'reference', 'ref', 'transaction no', 'transaction number', 'id transaction', 'numero transaction', 'id'],
  amount: ['amount credited', 'credit amount', 'credit', 'amount', 'montant', 'montant credit', 'value'],
  time: ['transaction date', 'date time', 'datetime', 'date heure', 'completed at', 'timestamp', 'date de transaction', 'date', 'time'],
  party: ['from msisdn', 'from number', 'sender', 'payer', 'from', 'counterparty', 'msisdn', 'expediteur', 'phone number', 'phone', 'de'],
  type: ['transaction type', 'type', 'direction', 'dr cr', 'debit credit', 'sens'],
  status: ['status', 'statut', 'etat'],
};
const pick = (headers, list) => list.find((a) => headers.includes(a)) || null;

function parseAmount(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const neg = s.startsWith('-'); s = s.replace(/-/g, '');
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) { const dec = Math.max(lastDot, lastComma); s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1); }
  else if (lastComma >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** Day-first (dd/mm/yyyy) or ISO. Cameroon is UTC+1 all year, so un-zoned times are read as +01:00. */
function parseTime(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) { const [, d, mo, y, h = '0', mi = '0', se = '0'] = m; const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${se.padStart(2, '0')}+01:00`; const t = Date.parse(iso); return Number.isNaN(t) ? null : new Date(t).toISOString(); }
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  const t = Date.parse(hasZone ? s : `${s.replace(' ', 'T')}${s.length <= 10 ? 'T00:00:00' : ''}+01:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const normTx = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function parseStatement(text, { maxRows = 20000 } = {}) {
  const { headers, records } = parseCsvObjects(text);
  const col = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, pick(headers, ALIASES[k])]));
  if (!col.txId || !col.amount) {
    const e = new Error(`Could not find the transaction-ID and amount columns. Columns in your file: ${headers.join(' | ') || '(none)'}.`);
    e.isAppError = true; e.statusCode = 400; throw e;
  }
  if (records.length > maxRows) { const e = new Error(`The file has more than ${maxRows} rows. Import it in smaller date ranges.`); e.isAppError = true; e.statusCode = 400; throw e; }
  const lines = []; let skipped = 0;
  for (const r of records) {
    const txId = (r[col.txId] || '').trim();
    const amount = parseAmount(r[col.amount]);
    const type = col.type ? (r[col.type] || '').toLowerCase() : '';
    const status = col.status ? (r[col.status] || '').toLowerCase() : '';
    const isDebit = /debit|withdraw|sent|payment to|cash out|transfer out|retrait|envoi/.test(type);
    const isBad = /fail|reject|cancel|declin|pending|echec|annul/.test(status);
    if (!txId || !normTx(txId) || amount === null || !(amount > 0) || isDebit || isBad) { skipped += 1; continue; }
    lines.push({ txId, txIdNorm: normTx(txId), amount, txTime: col.time ? parseTime(r[col.time]) : null, party: col.party ? (r[col.party] || '').slice(0, 40) : null, raw: r });
  }
  return { lines, skipped, columns: col };
}

/** Pure matching used by the report (and unit-tested). */
function classifyLine(line, payment) {
  if (!payment) return 'UNRECORDED';
  if (payment.status === 'FAILED') return 'REJECTED_BUT_RECEIVED';
  if (payment.status === 'PENDING') return 'PENDING_VERIFICATION';
  return Math.round(Number(payment.amount)) === Math.round(Number(line.amount)) ? 'MATCHED' : 'AMOUNT_MISMATCH';
}

module.exports = { parseStatement, parseAmount, parseTime, normTx, classifyLine };
