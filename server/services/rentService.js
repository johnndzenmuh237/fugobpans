/**
 * Loads tenants together with their LIVE rent position. Nothing about
 * months paid / owing / advance is stored — it is computed here from
 * monthly_rent + rent_start_date + the sum of confirmed RENT payments.
 */
const { query } = require('../config/db');
const { computeRentStatus } = require('../utils/rent');
const { getSettings } = require('./settingsService');
const { propertyScope } = require('../middleware/roles');
const { numify } = require('../utils/sql');

const TENANT_SELECT = `
  SELECT t.*, u.unit_no, u.house_no, u.category_id, u.property_id, u.rooms,
    p.name AS property_name, p.property_code, c.name AS category_name,
    ct.id AS contract_id, ct.contract_no, ct.start_date AS contract_start, ct.end_date AS contract_end,
    CASE WHEN ct.status = 'ACTIVE' AND ct.end_date < CURRENT_DATE THEN 'EXPIRED' ELSE ct.status END AS contract_status,
    COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.tenant_id = t.id AND pay.type = 'RENT' AND pay.status = 'SUCCESSFUL'), 0) AS rent_paid,
    COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.tenant_id = t.id AND pay.type = 'DEPOSIT' AND pay.status = 'SUCCESSFUL'), 0) AS deposit_paid,
    (SELECT COUNT(*)::int FROM payments pay WHERE pay.tenant_id = t.id AND pay.status = 'PENDING') AS pending_payments
  FROM tenants t
  JOIN units u ON u.id = t.unit_id
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN categories c ON c.id = u.category_id
  LEFT JOIN LATERAL (
    SELECT * FROM contracts x WHERE x.tenant_id = t.id AND x.status IN ('ACTIVE', 'RENEWED', 'TERMINATED')
    ORDER BY (x.status = 'ACTIVE') DESC, x.end_date DESC LIMIT 1
  ) ct ON true`;

function attachRent(row, settings, today = new Date()) {
  const r = numify(row, ['monthly_rent', 'security_deposit', 'rent_paid', 'deposit_paid']);
  r.rent = computeRentStatus({
    monthlyRent: r.monthly_rent, rentStartDate: r.rent_start_date, totalPaid: r.rent_paid, today,
    contractEnd: r.contract_end, dueSoonDays: settings.due_soon_days, graceDays: settings.grace_period_days,
  });
  return r;
}

/**
 * @param user   req.user (property scope applies to MANAGERs)
 * @param filters { propertyId, categoryId, status ('CURRENT' default | ACTIVE | MOVED_OUT | ALL...), q, tenantId }
 */
async function loadTenantsWithRent(user, filters = {}) {
  const { propertyId, categoryId, status = 'CURRENT', q, tenantId, unitId } = filters;
  const params = [];
  let sql = `${TENANT_SELECT} WHERE 1=1`;
  if (tenantId) { params.push(tenantId); sql += ` AND t.id = $${params.length}`; }
  if (unitId) { params.push(unitId); sql += ` AND t.unit_id = $${params.length}`; }
  if (propertyId) { params.push(propertyId); sql += ` AND u.property_id = $${params.length}`; }
  if (categoryId) { params.push(categoryId); sql += ` AND u.category_id = $${params.length}`; }
  if (status === 'CURRENT') sql += " AND t.status IN ('ACTIVE', 'NOTICE')";
  else if (status !== 'ALL') { params.push(status); sql += ` AND t.status = $${params.length}`; }
  if (q) {
    params.push(`%${q}%`);
    const n = params.length;
    sql += ` AND (t.first_name || ' ' || t.last_name ILIKE $${n} OR t.phone ILIKE $${n} OR t.tenant_code ILIKE $${n} OR t.tracking_code ILIKE $${n} OR u.unit_no ILIKE $${n} OR u.house_no ILIKE $${n} OR p.name ILIKE $${n})`;
  }
  if (user) sql += propertyScope(user, 'u.property_id', params);
  sql += ' ORDER BY p.name, u.house_no, u.unit_no LIMIT 5000';

  const [{ rows }, settings] = await Promise.all([query(sql, params), getSettings()]);
  return rows.map((r) => attachRent(r, settings));
}

module.exports = { TENANT_SELECT, attachRent, loadTenantsWithRent };
