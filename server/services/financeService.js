/**
 * Finance: expense tracking, budgets, debt tracking and the income
 * statement. Every figure is computed from real ledger rows (confirmed rent
 * payments, expenses, debt repayments) — nothing is hard-coded or cached.
 *
 * Security deposits are shown separately: they're money HELD for the tenant,
 * not income, so they never inflate revenue.
 */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');
const { propertyScope, canAccessProperty } = require('../middleware/roles');
const { numify, requireFields } = require('../utils/sql');
const { loadTenantsWithRent } = require('./rentService');

// ------------------------------------------------------------------ Expense categories
async function listExpenseCategories() {
  const { rows } = await query("SELECT * FROM expense_categories WHERE status = 'ACTIVE' ORDER BY name");
  return rows;
}
async function createExpenseCategory({ name }, actor) {
  requireFields({ name }, ['name']);
  const { rows } = await query('INSERT INTO expense_categories (name) VALUES ($1) RETURNING *', [name.trim()]);
  await writeAudit({ user: actor, action: 'CREATE_EXPENSE_CATEGORY', entity: 'expense_categories', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

// ------------------------------------------------------------------ Expenses
async function listExpenses(user, { from, to, categoryId, propertyId } = {}) {
  const params = [];
  let sql = `SELECT e.*, ec.name AS category_name, p.name AS property_name FROM expenses e
             JOIN expense_categories ec ON ec.id = e.category_id LEFT JOIN properties p ON p.id = e.property_id WHERE 1=1`;
  if (from) { params.push(from); sql += ` AND e.expense_date >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND e.expense_date <= $${params.length}`; }
  if (categoryId) { params.push(categoryId); sql += ` AND e.category_id = $${params.length}`; }
  if (propertyId) { params.push(propertyId); sql += ` AND e.property_id = $${params.length}`; }
  sql += propertyScope(user, 'e.property_id', params); // managers: only their properties' expenses
  sql += ' ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 3000';
  const { rows } = await query(sql, params);
  return rows.map((r) => numify(r, ['amount']));
}

async function createExpense({ propertyId, categoryId, description, amount, expenseDate, paymentMethod, vendor, notes }, actor) {
  requireFields({ categoryId, amount }, ['categoryId', 'amount']);
  if (!(Number(amount) > 0)) throw new AppError('Amount must be greater than zero.');
  if (propertyId && !canAccessProperty(actor, propertyId)) throw new AppError('You are not assigned to that property.', 403);
  if (!propertyId && actor.role === 'MANAGER') throw new AppError('Choose which property this expense belongs to.');
  const reference = await nextId('EXP');
  const { rows } = await query(
    `INSERT INTO expenses (reference, property_id, category_id, description, amount, expense_date, payment_method, vendor, recorded_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [reference, propertyId || null, categoryId, description || null, amount, expenseDate || new Date().toISOString().slice(0, 10), paymentMethod || 'CASH', vendor || null, actor.uid, notes || null]
  );
  await writeAudit({ user: actor, action: 'CREATE_EXPENSE', entity: 'expenses', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

// ------------------------------------------------------------------ Budgets
async function listBudgets(period) {
  let sql = `SELECT b.*, ec.name AS category_name,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.category_id = b.category_id AND to_char(e.expense_date,'YYYY-MM') = b.period), 0) AS spent
    FROM budgets b JOIN expense_categories ec ON ec.id = b.category_id`;
  const params = [];
  if (period) { params.push(period); sql += ' WHERE b.period = $1'; }
  sql += ' ORDER BY b.period DESC, ec.name';
  const { rows } = await query(sql, params);
  return rows.map((r) => {
    const spent = Number(r.spent); const amount = Number(r.amount);
    return { ...r, amount, spent, remaining: amount - spent, percent_used: amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0, over_budget: spent > amount };
  });
}

async function upsertBudget({ categoryId, period, amount }, actor) {
  if (!categoryId || !period || amount === undefined || amount === '') throw new AppError('categoryId, period (YYYY-MM) and amount are required.');
  if (!/^\d{4}-\d{2}$/.test(period)) throw new AppError('Period must look like 2026-10.');
  const { rows } = await query(
    `INSERT INTO budgets (category_id, period, amount, created_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (category_id, period) DO UPDATE SET amount = EXCLUDED.amount RETURNING *`, [categoryId, period, amount, actor.uid]);
  await writeAudit({ user: actor, action: 'SET_BUDGET', entity: 'budgets', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

// ------------------------------------------------------------------ Debts
async function listDebts(user, { status } = {}) {
  const params = [];
  let sql = `SELECT d.*, p.name AS property_name FROM debts d LEFT JOIN properties p ON p.id = d.property_id WHERE 1=1`;
  if (status === 'OPEN') sql += " AND d.amount_paid < d.total_amount";
  else if (status) { params.push(status); sql += ` AND d.status = $${params.length}`; }
  if (user?.role === 'MANAGER') { params.push(user.propertyIds || []); sql += ` AND d.property_id = ANY($${params.length}::uuid[])`; }
  sql += ' ORDER BY d.due_date NULLS LAST, d.created_at DESC LIMIT 2000';
  const { rows } = await query(sql, params);
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const out = numify(r, ['total_amount', 'amount_paid', 'balance']);
    if (out.status !== 'PAID' && r.due_date && String(r.due_date).slice(0, 10) < today && out.balance > 0) out.status = 'OVERDUE';
    return out;
  });
}

async function createDebt({ debtorName, debtorContact, description, propertyId, tenantId, totalAmount, amountPaid = 0, dueDate, notes }, actor) {
  requireFields({ debtorName, totalAmount }, ['debtorName', 'totalAmount']);
  const total = Number(totalAmount);
  const paid = Number(amountPaid) || 0;
  if (!(total > 0) || paid < 0 || paid > total) throw new AppError('Amounts are invalid: paid cannot exceed the total.');
  if (propertyId && !canAccessProperty(actor, propertyId)) throw new AppError('You are not assigned to that property.', 403);
  const reference = await nextId('DEBT');
  const status = paid <= 0 ? 'UNPAID' : paid >= total ? 'PAID' : 'PARTIALLY_PAID';
  const { rows } = await query(
    `INSERT INTO debts (reference, debtor_name, debtor_contact, description, property_id, tenant_id, total_amount, amount_paid, due_date, status, notes, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [reference, debtorName.trim(), debtorContact || null, description || null, propertyId || null, tenantId || null, total, paid, dueDate || null, status, notes || null, actor.uid]
  );
  await writeAudit({ user: actor, action: 'CREATE_DEBT', entity: 'debts', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

async function recordDebtPayment(debtId, { amount, paymentMethod = 'CASH' }, actor) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new AppError('Amount must be greater than zero.');
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM debts WHERE id = $1 FOR UPDATE', [debtId]);
    const debt = rows[0];
    if (!debt) throw new AppError('Debt not found.', 404);
    if (debt.property_id && !canAccessProperty(actor, debt.property_id)) throw new AppError('You are not assigned to that property.', 403);
    if (amt > Number(debt.balance) + 0.001) throw new AppError(`That is more than the remaining balance (${Number(debt.balance).toLocaleString()}).`);
    const newPaid = Number(debt.amount_paid) + amt;
    const status = newPaid >= Number(debt.total_amount) ? 'PAID' : 'PARTIALLY_PAID';
    await client.query('INSERT INTO debt_payments (debt_id, amount, payment_method, recorded_by) VALUES ($1,$2,$3,$4)', [debtId, amt, paymentMethod, actor.uid]);
    const { rows: upd } = await client.query('UPDATE debts SET amount_paid = $1, status = $2, updated_at = now() WHERE id = $3 RETURNING *', [newPaid, status, debtId]);
    return upd[0];
  });
  await writeAudit({ user: actor, action: 'RECORD_DEBT_PAYMENT', entity: 'debts', entityId: debtId, after: { amount: amt } });
  return result;
}

/** Live rent arrears (from the rent engine) — the "debt" every tenant who is behind currently owes. */
async function rentArrears(user, { propertyId } = {}) {
  const tenants = await loadTenantsWithRent(user, { propertyId, status: 'CURRENT' });
  return tenants
    .filter((t) => t.rent.amountOwing > 0)
    .map((t) => ({
      tenant_id: t.id, tenant_name: `${t.first_name} ${t.last_name}`, tenant_code: t.tenant_code, phone: t.phone, tracking_code: t.tracking_code,
      property_name: t.property_name, house_no: t.house_no, unit_no: t.unit_no, category_name: t.category_name, monthly_rent: t.monthly_rent,
      months_owing: t.rent.monthsOwing, amount_owing: t.rent.amountOwing, next_payment_date: t.rent.nextPaymentDate,
      days_overdue: Math.max(0, -t.rent.daysToNext), rent_status: t.rent.status,
    }))
    .sort((a, b) => b.amount_owing - a.amount_owing);
}

// ------------------------------------------------------------------ Income statement
function range(from, to) {
  const f = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const t = to || new Date().toISOString().slice(0, 10);
  return { from: f, to: t };
}

/** Appends the optional single-property filter + the manager scope to `sql`, pushing only the params it uses. */
function addPropertyFilter(params, user, propertyId, column) {
  let frag = '';
  if (propertyId) { params.push(propertyId); frag += ` AND ${column} = $${params.length}`; }
  frag += propertyScope(user, column, params);
  return frag;
}

async function incomeStatement(user, { from, to, propertyId } = {}) {
  const r = range(from, to);
  const sumPayments = (type) => {
    const pr = [r.from, r.to];
    const f = addPropertyFilter(pr, user, propertyId, 'pay.property_id');
    return query(`SELECT COALESCE(SUM(pay.amount),0) AS total FROM payments pay WHERE pay.status='SUCCESSFUL' AND pay.type='${type}' AND pay.paid_at::date BETWEEN $1 AND $2${f}`, pr);
  };

  const debtParams = [r.from, r.to];
  const debtFilter = addPropertyFilter(debtParams, user, propertyId, 'd.property_id');
  const catParams = [r.from, r.to];
  const catFilter = addPropertyFilter(catParams, user, propertyId, 'e.property_id');
  const propParams = [r.from, r.to];
  const propFilter = addPropertyFilter(propParams, user, propertyId, 'p.id');
  const monthParams = [r.from, r.to];
  const monthRentFilter = addPropertyFilter(monthParams, user, propertyId, 'pay.property_id');
  const monthExpFilter = addPropertyFilter(monthParams, user, propertyId, 'e.property_id');

  const [rent, other, deposits, debtRec, expByCat, byProperty, monthly] = await Promise.all([
    sumPayments('RENT'),
    sumPayments('OTHER'),
    sumPayments('DEPOSIT'),
    query(`SELECT COALESCE(SUM(dp.amount),0) AS total FROM debt_payments dp JOIN debts d ON d.id = dp.debt_id
           WHERE dp.paid_at::date BETWEEN $1 AND $2${debtFilter}`, debtParams),
    query(`SELECT ec.name AS category, COALESCE(SUM(e.amount),0) AS total FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
           WHERE e.expense_date BETWEEN $1 AND $2${catFilter} GROUP BY ec.name ORDER BY total DESC`, catParams),
    query(`SELECT p.id, p.name,
             COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.property_id = p.id AND pay.status='SUCCESSFUL' AND pay.type='RENT' AND pay.paid_at::date BETWEEN $1 AND $2),0) AS revenue,
             COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.property_id = p.id AND e.expense_date BETWEEN $1 AND $2),0) AS expenses
           FROM properties p WHERE 1=1${propFilter} ORDER BY revenue DESC`, propParams),
    query(`SELECT m.month,
             COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.status='SUCCESSFUL' AND pay.type='RENT' AND to_char(pay.paid_at,'YYYY-MM') = m.month${monthRentFilter}),0) AS revenue,
             COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE to_char(e.expense_date,'YYYY-MM') = m.month${monthExpFilter}),0) AS expenses
           FROM (SELECT to_char(g, 'YYYY-MM') AS month FROM generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') g) m
           ORDER BY m.month`, monthParams),
  ]);

  const rentIncome = Number(rent.rows[0].total);
  const otherIncome = Number(other.rows[0].total);
  const debtRecoveries = Number(debtRec.rows[0].total);
  const totalRevenue = rentIncome + otherIncome + debtRecoveries;
  const expenseRows = expByCat.rows.map((x) => ({ category: x.category, total: Number(x.total) }));
  const totalExpenses = expenseRows.reduce((s, x) => s + x.total, 0);
  return {
    period: r, rentIncome, otherIncome, debtRecoveries, totalRevenue, expensesByCategory: expenseRows, totalExpenses,
    netIncome: totalRevenue - totalExpenses, depositsCollected: Number(deposits.rows[0].total),
    byProperty: byProperty.rows.map((x) => ({ id: x.id, name: x.name, revenue: Number(x.revenue), expenses: Number(x.expenses), net: Number(x.revenue) - Number(x.expenses) })),
    monthly: monthly.rows.map((x) => ({ month: x.month, revenue: Number(x.revenue), expenses: Number(x.expenses) })),
  };
}

module.exports = {
  listExpenseCategories, createExpenseCategory, listExpenses, createExpense, listBudgets, upsertBudget,
  listDebts, createDebt, recordDebtPayment, rentArrears, incomeStatement,
};
