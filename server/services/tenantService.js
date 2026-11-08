/**
 * Tenant lifecycle: register (unit -> tenant -> contract -> first payment ->
 * receipt, all in ONE transaction), profile, update, move-out.
 */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { generateUniqueTrackingCode } = require('../utils/trackingCode');
const { writeAudit } = require('../utils/auditLogger');
const { addMonths, addDays, toISODate, todayISO } = require('../utils/rent');
const { buildUpdate, requireFields } = require('../utils/sql');
const { canAccessProperty } = require('../middleware/roles');
const { loadTenantsWithRent } = require('./rentService');
const { applyConfirmedPayment, refFor } = require('./paymentService');
const { notifyStaff } = require('./notificationService');

/**
 * Spec §5. Steps 1-4 in one call:
 *   unitId (Property -> House -> Unit) + tenant details + rent/deposit/contract
 *   duration/initial months paid/payment method/move-in date
 * => Tenant ID + tracking code + contract + (optional) confirmed payments + receipt numbers.
 */
async function registerTenant(body, actor) {
  requireFields(body, ['unitId', 'firstName', 'lastName', 'phone']);
  const moveIn = toISODate(body.moveInDate) || todayISO();
  const rentStart = toISODate(body.rentStartDate) || moveIn;
  const contractMonths = Number(body.contractMonths) || 12;
  if (contractMonths < 1 || contractMonths > 120) throw new AppError('Contract duration must be between 1 and 120 months.');
  const monthsInitiallyPaid = Number(body.monthsInitiallyPaid) || 0;
  if (monthsInitiallyPaid < 0 || monthsInitiallyPaid > 60) throw new AppError('Months initially paid must be between 0 and 60.');
  const depositPaid = Number(body.depositPaid) || 0;
  const method = body.paymentMethod || 'OFFICE_CASH';

  const result = await withTransaction(async (client) => {
    const { rows: uRows } = await client.query('SELECT * FROM units WHERE id = $1 FOR UPDATE', [body.unitId]);
    const unit = uRows[0];
    if (!unit) throw new AppError('Unit not found.', 404);
    if (!canAccessProperty(actor, unit.property_id)) throw new AppError('You are not assigned to that property.', 403);
    if (unit.status === 'OCCUPIED') throw new AppError('That unit already has a tenant.');
    if (unit.status === 'MAINTENANCE') throw new AppError('That unit is under maintenance and cannot be let right now.');

    const monthlyRent = Number(body.monthlyRent) || Number(unit.monthly_rent);
    if (!(monthlyRent > 0)) throw new AppError('Monthly rent must be greater than zero.');
    const deposit = body.securityDeposit !== undefined && body.securityDeposit !== '' ? Number(body.securityDeposit) : Number(unit.security_deposit);

    const tenantCode = await nextId('TEN');
    const trackingCode = await generateUniqueTrackingCode(client, 'tenants');
    const { rows: tRows } = await client.query(
      `INSERT INTO tenants (tenant_code, tracking_code, unit_id, first_name, last_name, phone, whatsapp, email, id_type, id_number,
         emergency_contact_name, emergency_contact_phone, address, occupation, move_in_date, monthly_rent, security_deposit, rent_start_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [tenantCode, trackingCode, body.unitId, body.firstName.trim(), body.lastName.trim(), body.phone.trim(), body.whatsapp || null, body.email || null,
        body.idType || null, body.idNumber || null, body.emergencyContactName || null, body.emergencyContactPhone || null, body.address || null,
        body.occupation || null, moveIn, monthlyRent, deposit, rentStart, body.notes || null, actor.uid]
    );
    const tenant = tRows[0];

    const { rows: termRows } = await client.query("SELECT id FROM terms_templates WHERE status = 'PUBLISHED' ORDER BY version DESC LIMIT 1");
    const contractNo = await nextId('CON');
    const startDate = toISODate(body.contractStartDate) || rentStart;
    const endDate = body.contractEndDate ? toISODate(body.contractEndDate) : addDays(addMonths(startDate, contractMonths), -1);
    const { rows: cRows } = await client.query(
      `INSERT INTO contracts (contract_no, tenant_id, unit_id, start_date, end_date, monthly_rent, security_deposit, payment_terms, renewal_terms, notice_period_days, house_rules, terms_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [contractNo, tenant.id, body.unitId, startDate, endDate, monthlyRent, deposit, body.paymentTerms || 'Rent is payable monthly in advance on the due date.',
        body.renewalTerms || 'Renewable by mutual agreement before the expiry date.', Number(body.noticePeriodDays) || 30, body.houseRules || null, termRows[0]?.id || null, actor.uid]
    );

    await client.query("UPDATE units SET status = 'OCCUPIED', vacant_since = NULL, updated_at = now() WHERE id = $1", [body.unitId]);

    const payments = [];
    if (monthsInitiallyPaid > 0) {
      payments.push(await applyConfirmedPayment(client, {
        tenantId: tenant.id, amount: monthsInitiallyPaid * monthlyRent, type: 'RENT', method,
        transactionReference: (body.transactionReference || '').trim() || refFor('REG'), recordedBy: actor.uid, notes: `Initial payment: ${monthsInitiallyPaid} month(s) at registration`,
      }));
    }
    if (depositPaid > 0) {
      payments.push(await applyConfirmedPayment(client, {
        tenantId: tenant.id, amount: depositPaid, type: 'DEPOSIT', method, transactionReference: refFor('DEP'), recordedBy: actor.uid, notes: 'Security deposit at registration',
      }));
    }
    return { tenant, contract: cRows[0], payments, unit };
  });

  await writeAudit({ user: actor, action: 'REGISTER_TENANT', entity: 'tenants', entityId: result.tenant.id, after: { tenantCode: result.tenant.tenant_code, unitId: body.unitId } });
  await notifyStaff({ title: 'New tenant registered', message: `${result.tenant.first_name} ${result.tenant.last_name} (${result.tenant.tenant_code}) was registered to a unit.`, type: 'INFO' });
  return {
    tenant: { id: result.tenant.id, tenantCode: result.tenant.tenant_code, trackingCode: result.tenant.tracking_code, name: `${result.tenant.first_name} ${result.tenant.last_name}` },
    contract: { id: result.contract.id, contractNo: result.contract.contract_no, startDate: result.contract.start_date, endDate: result.contract.end_date },
    receipts: result.payments.map((p) => ({ id: p.id, receiptNumber: p.receipt_number, type: p.type, amount: Number(p.amount) })),
  };
}

async function listTenants(user, filters) {
  let rows = await loadTenantsWithRent(user, filters);
  const { rentStatus, expiringDays } = filters || {};
  if (rentStatus === 'OWING') rows = rows.filter((r) => r.rent.monthsOwing > 0);
  else if (rentStatus === 'ADVANCE') rows = rows.filter((r) => r.rent.monthsAdvance > 0);
  else if (rentStatus) rows = rows.filter((r) => r.rent.status === rentStatus);
  if (expiringDays) {
    const limit = addDays(todayISO(), Number(expiringDays));
    rows = rows.filter((r) => r.contract_end && toISODate(r.contract_end) <= limit);
  }
  return rows;
}

async function getTenantProfile(user, id) {
  const [tenant] = await loadTenantsWithRent(user, { tenantId: id, status: 'ALL' });
  if (!tenant) throw new AppError('Tenant not found.', 404);
  if (!canAccessProperty(user, tenant.property_id)) throw new AppError('You are not assigned to that property.', 403);

  const [payments, contracts, maintenance, terms, latestTerms] = await Promise.all([
    query(`SELECT id, receipt_number, type, amount, months_covered, method, transaction_reference, status, period_from, period_to, previous_balance, remaining_balance, next_payment_date, paid_at, created_at, notes
           FROM payments WHERE tenant_id = $1 ORDER BY COALESCE(paid_at, created_at) DESC`, [id]),
    query('SELECT * FROM contracts WHERE tenant_id = $1 ORDER BY created_at DESC', [id]),
    query('SELECT id, request_no, title, status, priority, reported_at, completed_at FROM maintenance_requests WHERE tenant_id = $1 ORDER BY reported_at DESC LIMIT 50', [id]),
    query(`SELECT ta.accepted_at, tt.version FROM terms_acceptances ta JOIN terms_templates tt ON tt.id = ta.terms_id WHERE ta.tenant_id = $1 ORDER BY tt.version DESC LIMIT 1`, [id]),
    query("SELECT id, version FROM terms_templates WHERE status = 'PUBLISHED' ORDER BY version DESC LIMIT 1"),
  ]);
  return {
    tenant, payments: payments.rows, contracts: contracts.rows, maintenance: maintenance.rows,
    termsAccepted: terms.rows[0] || null, currentTermsVersion: latestTerms.rows[0]?.version || null,
  };
}

async function updateTenant(id, body, actor) {
  const [tenant] = await loadTenantsWithRent(actor, { tenantId: id, status: 'ALL' });
  if (!tenant) throw new AppError('Tenant not found.', 404);
  const map = {
    firstName: 'first_name', lastName: 'last_name', phone: 'phone', whatsapp: 'whatsapp', email: 'email', idType: 'id_type', idNumber: 'id_number',
    emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone', address: 'address', occupation: 'occupation', notes: 'notes',
  };
  if (body.status && ['ACTIVE', 'NOTICE'].includes(body.status) && ['ACTIVE', 'NOTICE'].includes(tenant.status)) map.status = 'status'; // give/withdraw notice
  const { sets, params } = buildUpdate(body, map, 2);
  const { rows } = await query(`UPDATE tenants SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`, [id, ...params]);
  await writeAudit({ user: actor, action: 'UPDATE_TENANT', entity: 'tenants', entityId: id, after: body });
  return rows[0];
}

/** Moves a tenant out (or marks evicted): frees the unit, ends the contract. History is preserved. */
async function moveOut(id, { date, outcome = 'MOVED_OUT', note } = {}, actor) {
  if (!['MOVED_OUT', 'EVICTED'].includes(outcome)) throw new AppError('Outcome must be MOVED_OUT or EVICTED.');
  const [tenant] = await loadTenantsWithRent(actor, { tenantId: id, status: 'ALL' });
  if (!tenant) throw new AppError('Tenant not found.', 404);
  if (!['ACTIVE', 'NOTICE'].includes(tenant.status)) throw new AppError('This tenant has already moved out.');
  const outDate = toISODate(date) || todayISO();
  await withTransaction(async (client) => {
    await client.query('UPDATE tenants SET status = $1, moved_out_date = $2, notes = COALESCE($3, notes), updated_at = now() WHERE id = $4', [outcome, outDate, note || null, id]);
    await client.query("UPDATE contracts SET status = 'TERMINATED' WHERE tenant_id = $1 AND status = 'ACTIVE'", [id]);
    await client.query("UPDATE units SET status = 'VACANT', vacant_since = $1, updated_at = now() WHERE id = $2", [outDate, tenant.unit_id]);
  });
  await writeAudit({ user: actor, action: outcome === 'EVICTED' ? 'EVICT_TENANT' : 'MOVE_OUT_TENANT', entity: 'tenants', entityId: id, after: { outDate, note, owingAtExit: tenant.rent.amountOwing } });
  return { ok: true, amountOwingAtExit: tenant.rent.amountOwing };
}

async function regenerateTrackingCode(id, actor) {
  const [tenant] = await loadTenantsWithRent(actor, { tenantId: id, status: 'ALL' });
  if (!tenant) throw new AppError('Tenant not found.', 404);
  const code = await withTransaction(async (client) => {
    const fresh = await generateUniqueTrackingCode(client, 'tenants');
    await client.query('UPDATE tenants SET tracking_code = $1, updated_at = now() WHERE id = $2', [fresh, id]);
    return fresh;
  });
  await writeAudit({ user: actor, action: 'REGENERATE_TRACKING_CODE', entity: 'tenants', entityId: id });
  return { trackingCode: code };
}

module.exports = { registerTenant, listTenants, getTenantProfile, updateTenant, moveOut, regenerateTrackingCode };
