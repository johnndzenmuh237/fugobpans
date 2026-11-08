/**
 * Tenant portal (spec §10, §29). A tenant enters their private TRACKING CODE
 * plus the last 4 digits of the phone number on file. Both must match, so a
 * leaked / guessed code alone reveals nothing. A successful lookup returns
 * a short-lived signed portal token (not a staff session), which the tenant
 * then uses to view their own data, pay, accept terms and report problems.
 * A token only ever resolves to ONE tenant — there is no way to list others.
 */
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { loadTenantsWithRent } = require('./rentService');
const { getSettings, getPublicSettings } = require('./settingsService');
const { submitTenantPayment, buildReceipt } = require('./paymentService');
const { createRequest } = require('./maintenanceService');
const { getPublishedTerms } = require('./contractService');

const PORTAL_TTL = '2h';
const digits = (s) => String(s || '').replace(/\D/g, '');

function sign(tenantId) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign({ tid: tenantId, scope: 'tenant-portal' }, process.env.JWT_SECRET, { expiresIn: PORTAL_TTL });
}

function verifyPortalToken(token) {
  try {
    const d = jwt.verify(token, process.env.JWT_SECRET);
    if (d.scope !== 'tenant-portal' || !d.tid) throw new Error('bad scope');
    return d.tid;
  } catch { throw new AppError('Your session expired. Please enter your tracking code again.', 401); }
}

/** Constant failure message so nobody can tell whether a code exists. */
const BAD = 'We could not find a tenant with that tracking code and phone number. Please check both and try again.';

async function portalLogin(code, phoneLast4) {
  const normalized = String(code || '').trim().toUpperCase();
  const last4 = digits(phoneLast4).slice(-4);
  if (!normalized || last4.length < 4) throw new AppError('Enter your tracking code and the last 4 digits of your phone number.');
  const { rows } = await query('SELECT id, phone, status FROM tenants WHERE tracking_code = $1', [normalized]);
  const t = rows[0];
  if (!t || digits(t.phone).slice(-4) !== last4) throw new AppError(BAD, 404);
  return { token: sign(t.id) };
}

async function loadPortalData(tenantId) {
  const [tenant] = await loadTenantsWithRent(null, { tenantId, status: 'ALL' });
  if (!tenant) throw new AppError('Tenant not found.', 404);
  const [payments, maintenance, notifs, terms, accepted, settings] = await Promise.all([
    query(`SELECT id, receipt_number, type, amount, months_covered, method, transaction_reference, status, period_from, period_to, paid_at, created_at, notes
           FROM payments WHERE tenant_id = $1 ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 200`, [tenantId]),
    query('SELECT id, request_no, title, description, status, priority, reported_at, completed_at FROM maintenance_requests WHERE tenant_id = $1 ORDER BY reported_at DESC LIMIT 50', [tenantId]),
    query('SELECT id, title, message, type, created_at FROM notifications WHERE to_tenant_id = $1 ORDER BY created_at DESC LIMIT 30', [tenantId]),
    getPublishedTerms(),
    query('SELECT terms_id, accepted_at FROM terms_acceptances WHERE tenant_id = $1', [tenantId]),
    getPublicSettings(),
  ]);
  const acceptedIds = new Set(accepted.rows.map((a) => a.terms_id));
  const { rows: contract } = await query(`SELECT contract_no, start_date, end_date, monthly_rent, security_deposit, payment_terms, renewal_terms, notice_period_days, house_rules, status FROM contracts WHERE tenant_id = $1 ORDER BY (status='ACTIVE') DESC, end_date DESC LIMIT 1`, [tenantId]);
  const r = tenant.rent;
  const monthsStayed = Math.max(0, Math.floor((Date.now() - new Date(tenant.move_in_date).getTime()) / (30.4375 * 86400000)));

  return {
    profile: {
      name: `${tenant.first_name} ${tenant.last_name}`, tenantCode: tenant.tenant_code, trackingCode: tenant.tracking_code, phone: tenant.phone, email: tenant.email,
      idType: tenant.id_type, idNumber: tenant.id_number ? `••••${String(tenant.id_number).slice(-3)}` : null, // never echo a full ID number back
      registrationDate: tenant.registration_date, moveInDate: tenant.move_in_date, monthsStayed, status: tenant.status,
    },
    rental: { propertyName: tenant.property_name, houseNo: tenant.house_no, unitNo: tenant.unit_no, categoryName: tenant.category_name, propertyId: tenant.property_id, categoryId: tenant.category_id },
    rent: {
      monthlyRent: tenant.monthly_rent, monthsPaid: r.monthsPaid, monthsOwing: r.monthsOwing, monthsAdvance: r.monthsAdvance, amountOwing: r.amountOwing, amountAdvance: r.amountAdvance,
      nextPaymentDate: r.nextPaymentDate, status: r.status, paidThroughDate: r.paidThroughDate, depositPaid: tenant.deposit_paid, securityDeposit: tenant.security_deposit,
    },
    contract: contract[0] || null,
    payments: payments.rows,
    maintenance: maintenance.rows,
    notifications: notifs.rows,
    terms: terms ? { id: terms.id, version: terms.version, title: terms.title, body: terms.body, accepted: acceptedIds.has(terms.id) } : null,
    payTo: {
      mtnNumber: settings.momo_mtn_number, mtnName: settings.momo_mtn_name, orangeNumber: settings.momo_orange_number, orangeName: settings.momo_orange_name,
      instructions: settings.payment_instructions, supportCall: settings.support_call_number, whatsapp: settings.whatsapp, currency: settings.currency,
    },
    pendingCount: tenant.pending_payments,
  };
}

/** Announcements visible to ONE tenant: everything for ALL + their property + their house category. */
async function tenantAnnouncements(tenantId) {
  const { rows } = await query(`
    SELECT a.id, a.title, a.body, a.kind, a.audience, a.pinned, a.created_at, p.name AS property_name, c.name AS category_name
    FROM announcements a
    LEFT JOIN properties p ON p.id = a.property_id
    LEFT JOIN categories c ON c.id = a.category_id
    JOIN tenants t ON t.id = $1
    JOIN units u ON u.id = t.unit_id
    WHERE a.status = 'ACTIVE' AND (a.expires_at IS NULL OR a.expires_at >= CURRENT_DATE)
      AND (a.audience = 'ALL' OR (a.audience = 'PROPERTY' AND a.property_id = u.property_id) OR (a.audience = 'CATEGORY' AND a.category_id = u.category_id))
    ORDER BY a.pinned DESC, a.created_at DESC LIMIT 100`, [tenantId]);
  return rows;
}

async function acceptTerms(tenantId, termsId, ip) {
  const terms = await getPublishedTerms();
  if (!terms || terms.id !== termsId) throw new AppError('Those terms are no longer current. Please reload the page.');
  await query('INSERT INTO terms_acceptances (tenant_id, terms_id, ip) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, terms_id) DO NOTHING', [tenantId, termsId, ip || null]);
  return { ok: true };
}

async function reportProblem(tenantId, body) {
  const [tenant] = await loadTenantsWithRent(null, { tenantId, status: 'ALL' });
  if (!tenant || !['ACTIVE', 'NOTICE'].includes(tenant.status)) throw new AppError('Only current tenants can report a maintenance problem.');
  return createRequest({ unitId: tenant.unit_id, tenantId, title: body.title, description: body.description, priority: ['LOW', 'NORMAL', 'HIGH'].includes(body.priority) ? body.priority : 'NORMAL' }, null);
}

async function portalReceipt(tenantId, paymentId) { return buildReceipt(paymentId, { tenantId }); }

module.exports = { portalLogin, verifyPortalToken, loadPortalData, tenantAnnouncements, acceptTerms, reportProblem, submitTenantPayment, portalReceipt };
