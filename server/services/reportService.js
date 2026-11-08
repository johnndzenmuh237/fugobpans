/**
 * Reports (spec §24). Each report returns { title, columns:[{key,label}], rows }
 * so one generic UI renders all of them, and ?format=csv exports any of them
 * (CSV opens directly in Excel; "PDF" is the browser's Print -> Save as PDF).
 */
const { query } = require('../config/db');
const { propertyScope } = require('../middleware/roles');
const { loadTenantsWithRent } = require('./rentService');
const { listContracts } = require('./contractService');
const { listPayments } = require('./paymentService');
const { listExpenses, rentArrears } = require('./financeService');
const { listUnits } = require('./propertyService');
const { listRequests } = require('./maintenanceService');

const d = (v) => (v ? String(typeof v === 'string' ? v : new Date(v).toISOString()).slice(0, 10) : '');

const REPORTS = {
  tenants: { title: 'Tenant Report', roles: ['tenants'] },
  properties: { title: 'Property Report', roles: ['properties'] },
  collection: { title: 'Rent Collection Report', roles: ['payments', 'finance'] },
  arrears: { title: 'Arrears Report', roles: ['payments', 'finance', 'tenants'] },
  vacancy: { title: 'Vacancy Report', roles: ['properties'] },
  revenue: { title: 'Revenue Report', roles: ['finance'] },
  expenses: { title: 'Expense Report', roles: ['finance'] },
  maintenance: { title: 'Maintenance Report', roles: ['maintenance'] },
  contracts: { title: 'Contract Expiration Report', roles: ['contracts'] },
};

function canRun(user, key) { return user.role === 'ADMIN' || REPORTS[key].roles.some((p) => user.permissions.includes(p)); }

async function run(user, key, f = {}) {
  if (!REPORTS[key]) return null;
  const title = REPORTS[key].title;
  const propertyId = f.propertyId || undefined;

  if (key === 'tenants') {
    const rows = (await loadTenantsWithRent(user, { propertyId, status: f.status || 'CURRENT' })).map((t) => ({
      code: t.tenant_code, name: `${t.first_name} ${t.last_name}`, phone: t.phone, property: t.property_name, house: t.house_no, unit: t.unit_no, category: t.category_name || '',
      rent: t.monthly_rent, paid: t.rent.monthsPaid, owing: t.rent.monthsOwing, advance: t.rent.monthsAdvance, balance: t.rent.amountOwing, next: t.rent.nextPaymentDate, status: t.rent.status.replace(/_/g, ' '),
    }));
    return { title, columns: [['code', 'Tenant ID'], ['name', 'Name'], ['phone', 'Phone'], ['property', 'Property'], ['house', 'House'], ['unit', 'Unit'], ['category', 'Category'], ['rent', 'Monthly Rent'], ['paid', 'Months Paid'], ['owing', 'Months Owing'], ['advance', 'Months Advance'], ['balance', 'Amount Owing'], ['next', 'Next Payment'], ['status', 'Rent Status']], rows };
  }
  if (key === 'properties') {
    const params = [];
    const { rows } = await query(`SELECT p.property_code, p.name, p.kind, p.purpose, p.construction_status, p.completion_percent, p.location, l.name AS landlord,
        (SELECT COUNT(*)::int FROM units u WHERE u.property_id = p.id) AS units,
        (SELECT COUNT(*)::int FROM units u WHERE u.property_id = p.id AND u.status='OCCUPIED') AS occupied,
        (SELECT COALESCE(SUM(pay.amount),0) FROM payments pay WHERE pay.property_id = p.id AND pay.type='RENT' AND pay.status='SUCCESSFUL') AS revenue
      FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id WHERE 1=1${propertyScope(user, 'p.id', params)} ORDER BY p.name`, params);
    return { title, columns: [['property_code', 'Code'], ['name', 'Property'], ['kind', 'Type'], ['purpose', 'Purpose'], ['construction_status', 'Construction'], ['completion_percent', 'Complete %'], ['location', 'Location'], ['landlord', 'Landlord'], ['units', 'Units'], ['occupied', 'Occupied'], ['revenue', 'Rent Collected (all time)']], rows: rows.map((r) => ({ ...r, revenue: Number(r.revenue) })) };
  }
  if (key === 'collection') {
    const rows = (await listPayments(user, { propertyId, status: 'SUCCESSFUL', from: f.from, to: f.to })).map((p) => ({
      receipt: p.receipt_number, date: d(p.paid_at), tenant: p.tenant_name, property: p.property_name, unit: `House ${p.house_no} / ${p.unit_no}`, type: p.type, method: p.method.replace(/_/g, ' '), amount: p.amount, months: p.months_covered ?? '', ref: p.transaction_reference, by: p.authorized_by || '',
    }));
    return { title, columns: [['receipt', 'Receipt'], ['date', 'Date'], ['tenant', 'Tenant'], ['property', 'Property'], ['unit', 'House / Unit'], ['type', 'Type'], ['method', 'Method'], ['amount', 'Amount'], ['months', 'Months'], ['ref', 'Reference'], ['by', 'Confirmed By']], rows };
  }
  if (key === 'arrears') {
    const rows = (await rentArrears(user, { propertyId })).map((a) => ({ tenant: a.tenant_name, phone: a.phone, property: a.property_name, unit: `House ${a.house_no} / ${a.unit_no}`, months: a.months_owing, owing: a.amount_owing, days: a.days_overdue, due: a.next_payment_date, status: a.rent_status.replace(/_/g, ' ') }));
    return { title, columns: [['tenant', 'Tenant'], ['phone', 'Phone'], ['property', 'Property'], ['unit', 'House / Unit'], ['months', 'Months Owing'], ['owing', 'Amount Owing'], ['days', 'Days Overdue'], ['due', 'Oldest Unpaid Due'], ['status', 'Status']], rows };
  }
  if (key === 'vacancy') {
    const rows = (await listUnits(user, { propertyId, status: 'VACANT' })).map((u) => ({ property: u.property_name, house: u.house_no, unit: u.unit_no, category: u.category_name || '', rooms: u.rooms, rent: u.monthly_rent, deposit: u.security_deposit, days: u.vacant_days ?? '' }));
    return { title, columns: [['property', 'Property'], ['house', 'House'], ['unit', 'Unit'], ['category', 'Category'], ['rooms', 'Rooms'], ['rent', 'Monthly Rent'], ['deposit', 'Deposit'], ['days', 'Days Vacant']], rows };
  }
  if (key === 'revenue') {
    const params = [];
    const from = f.from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to = f.to || new Date().toISOString().slice(0, 10);
    params.push(from, to);
    const scope = propertyScope(user, 'pay.property_id', params);
    let pf = '';
    if (propertyId) { params.push(propertyId); pf = ` AND pay.property_id = $${params.length}`; }
    const { rows } = await query(`SELECT to_char(pay.paid_at,'YYYY-MM') AS month, p.name AS property, COALESCE(c.name,'—') AS category, SUM(pay.amount) AS revenue, COUNT(*)::int AS payments
      FROM payments pay JOIN properties p ON p.id = pay.property_id JOIN units u ON u.id = pay.unit_id LEFT JOIN categories c ON c.id = u.category_id
      WHERE pay.status='SUCCESSFUL' AND pay.type='RENT' AND pay.paid_at::date BETWEEN $1 AND $2${scope}${pf}
      GROUP BY 1,2,3 ORDER BY 1 DESC, 2, 3`, params);
    return { title, columns: [['month', 'Month'], ['property', 'Property'], ['category', 'Category'], ['payments', 'Payments'], ['revenue', 'Revenue']], rows: rows.map((r) => ({ ...r, revenue: Number(r.revenue) })) };
  }
  if (key === 'expenses') {
    const rows = (await listExpenses(user, { propertyId, from: f.from, to: f.to })).map((e) => ({ date: d(e.expense_date), ref: e.reference, property: e.property_name || 'General', category: e.category_name, description: e.description || '', vendor: e.vendor || '', amount: e.amount }));
    return { title, columns: [['date', 'Date'], ['ref', 'Ref'], ['property', 'Property'], ['category', 'Category'], ['description', 'Description'], ['vendor', 'Vendor'], ['amount', 'Amount']], rows };
  }
  if (key === 'maintenance') {
    const rows = (await listRequests(user, { propertyId })).map((m) => ({ no: m.request_no, date: d(m.reported_at), property: m.property_name, unit: m.unit_no ? `House ${m.house_no} / ${m.unit_no}` : '', title: m.title, priority: m.priority, status: m.status.replace('_', ' '), worker: m.worker_name || '', est: m.estimated_cost ?? '', actual: m.actual_cost ?? '' }));
    return { title, columns: [['no', 'Request'], ['date', 'Reported'], ['property', 'Property'], ['unit', 'House / Unit'], ['title', 'Problem'], ['priority', 'Priority'], ['status', 'Status'], ['worker', 'Assigned To'], ['est', 'Estimated Cost'], ['actual', 'Actual Cost']], rows };
  }
  const rows = (await listContracts(user, { filter: 'EXPIRING', days: Number(f.days) || 90, propertyId })).map((c) => ({ no: c.contract_no, tenant: c.tenant_name, property: c.property_name, unit: `House ${c.house_no} / ${c.unit_no}`, start: d(c.start_date), end: d(c.end_date), left: c.days_left, rent: c.monthly_rent }));
  return { title, columns: [['no', 'Contract'], ['tenant', 'Tenant'], ['property', 'Property'], ['unit', 'House / Unit'], ['start', 'Start'], ['end', 'Expiry'], ['left', 'Days Left'], ['rent', 'Monthly Rent']], rows };
}

function toCsv(report) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [report.columns.map(([, l]) => esc(l)).join(',')];
  report.rows.forEach((r) => lines.push(report.columns.map(([k]) => esc(r[k])).join(',')));
  return `\uFEFF${lines.join('\r\n')}`; // BOM so Excel reads UTF-8 accents correctly
}

/** Global search (spec §25): tenant, property, house, unit, tenant ID, receipt number, phone. */
async function globalSearch(user, q) {
  const term = String(q || '').trim();
  if (term.length < 2) return { tenants: [], properties: [], units: [], receipts: [] };
  const like = `%${term}%`;
  const tp = [like]; const ts = propertyScope(user, 'u.property_id', tp);
  const pp = [like]; const ps = propertyScope(user, 'p.id', pp);
  const up = [like]; const us = propertyScope(user, 'u.property_id', up);
  const rp = [like]; const rs = propertyScope(user, 'pay.property_id', rp);
  const [tenants, properties, units, receipts] = await Promise.all([
    query(`SELECT t.id, t.tenant_code, t.first_name || ' ' || t.last_name AS name, t.phone, t.status, p.name AS property_name, u.house_no, u.unit_no
           FROM tenants t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id
           WHERE (t.first_name || ' ' || t.last_name ILIKE $1 OR t.phone ILIKE $1 OR t.tenant_code ILIKE $1 OR t.tracking_code ILIKE $1)${ts} ORDER BY t.created_at DESC LIMIT 8`, tp),
    query(`SELECT p.id, p.property_code, p.name, p.kind, p.location FROM properties p WHERE (p.name ILIKE $1 OR p.property_code ILIKE $1 OR p.location ILIKE $1)${ps} LIMIT 8`, pp),
    query(`SELECT u.id, u.house_no, u.unit_no, u.status, p.name AS property_name FROM units u JOIN properties p ON p.id = u.property_id
           WHERE (u.unit_no ILIKE $1 OR u.house_no ILIKE $1)${us} LIMIT 8`, up),
    query(`SELECT pay.id, pay.receipt_number, pay.amount, pay.paid_at, t.first_name || ' ' || t.last_name AS tenant_name FROM payments pay JOIN tenants t ON t.id = pay.tenant_id
           WHERE pay.status = 'SUCCESSFUL' AND (pay.receipt_number ILIKE $1 OR pay.transaction_reference ILIKE $1)${rs} ORDER BY pay.paid_at DESC LIMIT 8`, rp),
  ]);
  return { tenants: tenants.rows, properties: properties.rows, units: units.rows, receipts: receipts.rows.map((r) => ({ ...r, amount: Number(r.amount) })) };
}

module.exports = { REPORTS, canRun, run, toCsv, globalSearch };
