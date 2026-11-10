/**
 * Writes one row to payment_verification_history (append-only; a database trigger blocks UPDATE/DELETE).
 * Always pass the transaction `client` so the history row commits or rolls back together with the money movement.
 *
 * tolerateMissingTable: used by the PRE-EXISTING payment paths so that, if migration 9 has not been applied yet,
 * they keep working exactly as before instead of failing. (Uses a savepoint so the surrounding transaction survives.)
 */
async function addHistory(client, { paymentId, event, fromStatus = null, toStatus = null, amount = null, receiptNumber = null, actor = null, note = null, ip = null, tolerateMissingTable = false }) {
  const sql = `INSERT INTO payment_verification_history (payment_id, event, from_status, to_status, amount, receipt_number, actor_id, actor_name, actor_role, note, ip)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;
  const params = [paymentId, event, fromStatus, toStatus, amount, receiptNumber, actor?.uid || null,
    actor?.name || 'Payment gateway / system', actor?.role || null, note ? String(note).slice(0, 500) : null, ip ? String(ip).slice(0, 80) : null];
  if (!tolerateMissingTable) { await client.query(sql, params); return; }
  await client.query('SAVEPOINT pvh');
  try { await client.query(sql, params); await client.query('RELEASE SAVEPOINT pvh'); }
  catch (e) {
    if (e.code === '42P01') { await client.query('ROLLBACK TO SAVEPOINT pvh'); return; }
    throw e;
  }
}

const clientIp = (req) => (req ? String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() : null);
const normTx = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

module.exports = { addHistory, clientIp, normTx };
