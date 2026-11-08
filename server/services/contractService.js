/** Contracts, renewals, and the Terms & Conditions templates tenants must accept (spec §11, §13). */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');
const { addMonths, addDays, toISODate } = require('../utils/rent');
const { propertyScope, canAccessProperty } = require('../middleware/roles');
const { numify, requireFields } = require('../utils/sql');
const { notify } = require('./notificationService');

const EFFECTIVE_STATUS = "CASE WHEN c.status = 'ACTIVE' AND c.end_date < CURRENT_DATE THEN 'EXPIRED' ELSE c.status END";

/** filter: ALL | ACTIVE | EXPIRING (<= days) | EXPIRED | ENDED */
async function listContracts(user, { filter = 'ALL', days = 60, propertyId, q } = {}) {
  const params = [];
  let sql = `
    SELECT c.*, ${EFFECTIVE_STATUS} AS effective_status, (c.end_date - CURRENT_DATE) AS days_left,
      (t.first_name || ' ' || t.last_name) AS tenant_name, t.tenant_code, t.status AS tenant_status, t.phone AS tenant_phone,
      u.unit_no, u.house_no, u.property_id, p.name AS property_name, tt.version AS terms_version,
      (SELECT MAX(tt2.version) FROM terms_acceptances ta JOIN terms_templates tt2 ON tt2.id = ta.terms_id WHERE ta.tenant_id = t.id) AS accepted_version
    FROM contracts c
    JOIN tenants t ON t.id = c.tenant_id
    JOIN units u ON u.id = c.unit_id
    JOIN properties p ON p.id = u.property_id
    LEFT JOIN terms_templates tt ON tt.id = c.terms_id
    WHERE 1=1`;
  if (propertyId) { params.push(propertyId); sql += ` AND u.property_id = $${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (c.contract_no ILIKE $${params.length} OR t.first_name || ' ' || t.last_name ILIKE $${params.length} OR t.tenant_code ILIKE $${params.length})`; }
  if (filter === 'ACTIVE') sql += " AND c.status = 'ACTIVE' AND c.end_date >= CURRENT_DATE";
  else if (filter === 'EXPIRING') { params.push(Number(days) || 60); sql += ` AND c.status = 'ACTIVE' AND t.status IN ('ACTIVE','NOTICE') AND c.end_date <= CURRENT_DATE + $${params.length}::int`; }
  else if (filter === 'EXPIRED') sql += " AND c.status = 'ACTIVE' AND c.end_date < CURRENT_DATE AND t.status IN ('ACTIVE','NOTICE')";
  else if (filter === 'ENDED') sql += " AND c.status IN ('TERMINATED', 'RENEWED')";
  sql += propertyScope(user, 'u.property_id', params);
  sql += ' ORDER BY c.end_date ASC LIMIT 2000';
  const { rows } = await query(sql, params);
  return rows.map((r) => numify(r, ['monthly_rent', 'security_deposit', 'days_left', 'terms_version', 'accepted_version']));
}

/** Renew = close the old contract as RENEWED and open a new one starting the day after (rent stays the same). */
async function renewContract(contractId, { months = 12, noticePeriodDays, renewalTerms } = {}, actor) {
  const m = Number(months);
  if (!Number.isInteger(m) || m < 1 || m > 120) throw new AppError('Renewal length must be between 1 and 120 months.');
  const { rows } = await query(
    `SELECT c.*, u.property_id, t.status AS tenant_status FROM contracts c JOIN units u ON u.id = c.unit_id JOIN tenants t ON t.id = c.tenant_id WHERE c.id = $1`, [contractId]);
  const old = rows[0];
  if (!old) throw new AppError('Contract not found.', 404);
  if (!canAccessProperty(actor, old.property_id)) throw new AppError('You are not assigned to that property.', 403);
  if (old.status !== 'ACTIVE') throw new AppError('Only an active contract can be renewed.');
  if (!['ACTIVE', 'NOTICE'].includes(old.tenant_status)) throw new AppError('This tenant has moved out.');

  const created = await withTransaction(async (client) => {
    const start = addDays(toISODate(old.end_date), 1);
    const end = addDays(addMonths(start, m), -1);
    await client.query("UPDATE contracts SET status = 'RENEWED' WHERE id = $1", [contractId]);
    const { rows: latest } = await client.query("SELECT id FROM terms_templates WHERE status = 'PUBLISHED' ORDER BY version DESC LIMIT 1");
    const contractNo = await nextId('CON');
    const { rows: c } = await client.query(
      `INSERT INTO contracts (contract_no, tenant_id, unit_id, start_date, end_date, monthly_rent, security_deposit, payment_terms, renewal_terms, notice_period_days, house_rules, terms_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [contractNo, old.tenant_id, old.unit_id, start, end, old.monthly_rent, old.security_deposit, old.payment_terms, renewalTerms || old.renewal_terms,
        Number(noticePeriodDays) || old.notice_period_days, old.house_rules, latest[0]?.id || old.terms_id, actor.uid]
    );
    return c[0];
  });
  await writeAudit({ user: actor, action: 'RENEW_CONTRACT', entity: 'contracts', entityId: created.id, before: { previous: old.contract_no }, after: created });
  await notify({ toTenantId: old.tenant_id, title: 'Contract renewed', message: `Your tenancy was renewed until ${String(created.end_date).slice(0, 10)}. Contract ${created.contract_no}.`, type: 'SUCCESS' });
  return created;
}

async function sendContractReminder(contractId, actor) {
  const { rows } = await query(
    `SELECT c.contract_no, c.end_date, c.tenant_id, u.property_id FROM contracts c JOIN units u ON u.id = c.unit_id WHERE c.id = $1`, [contractId]);
  const c = rows[0];
  if (!c) throw new AppError('Contract not found.', 404);
  if (!canAccessProperty(actor, c.property_id)) throw new AppError('You are not assigned to that property.', 403);
  await notify({ toTenantId: c.tenant_id, title: 'Contract expiring soon', type: 'WARNING',
    message: `Your contract ${c.contract_no} ends on ${String(c.end_date).slice(0, 10)}. Please contact management about renewal.` });
  await writeAudit({ user: actor, action: 'SEND_CONTRACT_REMINDER', entity: 'contracts', entityId: contractId });
  return { ok: true };
}

// ------------------------------------------------------------------ Terms & Conditions
async function listTerms() {
  const { rows } = await query(`
    SELECT t.*, (SELECT COUNT(*)::int FROM terms_acceptances a WHERE a.terms_id = t.id) AS acceptances
    FROM terms_templates t ORDER BY t.version DESC`);
  return rows;
}

async function createTerms({ title, body }, actor) {
  requireFields({ title, body }, ['title', 'body']);
  const { rows } = await query(
    `INSERT INTO terms_templates (version, title, body, created_by)
     VALUES (COALESCE((SELECT MAX(version) FROM terms_templates), 0) + 1, $1, $2, $3) RETURNING *`, [title.trim(), body, actor.uid]);
  await writeAudit({ user: actor, action: 'CREATE_TERMS', entity: 'terms_templates', entityId: rows[0].id, after: { version: rows[0].version } });
  return rows[0];
}

async function updateTerms(id, { title, body }, actor) {
  const { rows: cur } = await query('SELECT * FROM terms_templates WHERE id = $1', [id]);
  if (!cur.length) throw new AppError('Terms not found.', 404);
  if (cur[0].status !== 'DRAFT') throw new AppError('Only a draft can be edited. To change published terms, create a new version and publish it.');
  const { rows } = await query('UPDATE terms_templates SET title = COALESCE($1, title), body = COALESCE($2, body) WHERE id = $3 RETURNING *', [title || null, body || null, id]);
  await writeAudit({ user: actor, action: 'UPDATE_TERMS', entity: 'terms_templates', entityId: id });
  return rows[0];
}

/** Publishing archives the previous version; tenants are asked to accept the new one on their next visit. */
async function publishTerms(id, actor) {
  const published = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM terms_templates WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) throw new AppError('Terms not found.', 404);
    if (rows[0].status !== 'DRAFT') throw new AppError('Only a draft can be published.');
    await client.query("UPDATE terms_templates SET status = 'ARCHIVED' WHERE status = 'PUBLISHED'");
    const { rows: out } = await client.query("UPDATE terms_templates SET status = 'PUBLISHED', published_at = now() WHERE id = $1 RETURNING *", [id]);
    return out[0];
  });
  await writeAudit({ user: actor, action: 'PUBLISH_TERMS', entity: 'terms_templates', entityId: id, after: { version: published.version } });
  return published;
}

async function getPublishedTerms() {
  const { rows } = await query("SELECT * FROM terms_templates WHERE status = 'PUBLISHED' ORDER BY version DESC LIMIT 1");
  return rows[0] || null;
}

module.exports = { listContracts, renewContract, sendContractReminder, listTerms, createTerms, updateTerms, publishTerms, getPublishedTerms };
