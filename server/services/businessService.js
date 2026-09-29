/**
 * Business Management service — expense tracking, budgets, debt/credit
 * register (including unpaid staff salaries), sales, inventory, and the
 * income statement / profit-loss reports built from real ledger data.
 * No number here is ever hard-coded: everything is computed from
 * invoices/payments (school fees), sales, expenses, and payroll_items.
 */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');
const payroll = require('./payrollService');

// ---------------------------------------------------------------- Expense categories
async function listExpenseCategories() {
  const { rows } = await query("SELECT * FROM expense_categories WHERE status = 'ACTIVE' ORDER BY name");
  return rows;
}
async function createExpenseCategory({ name }, actor) {
  if (!name) throw new AppError('Category name is required.');
  const { rows } = await query('INSERT INTO expense_categories (name) VALUES ($1) RETURNING *', [name.trim()]);
  await writeAudit({ user: actor, action: 'CREATE_EXPENSE_CATEGORY', entity: 'expense_categories', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

// ---------------------------------------------------------------- Expenses
async function listExpenses({ from, to, categoryId } = {}) {
  let sql = `SELECT e.*, ec.name AS category_name FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE 1=1`;
  const params = [];
  if (from) { params.push(from); sql += ` AND e.expense_date >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND e.expense_date <= $${params.length}`; }
  if (categoryId) { params.push(categoryId); sql += ` AND e.category_id = $${params.length}`; }
  sql += ' ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 2000';
  const { rows } = await query(sql, params);
  return rows;
}

async function createExpense({ categoryId, description, amount, expenseDate, paymentMethod, vendor, notes }, actor) {
  if (!categoryId || !amount) throw new AppError('categoryId and amount are required.');
  const reference = await nextId('EXP');
  const { rows } = await query(
    `INSERT INTO expenses (reference, category_id, description, amount, expense_date, payment_method, vendor, recorded_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [reference, categoryId, description || null, amount, expenseDate || new Date().toISOString().slice(0, 10), paymentMethod || 'CASH', vendor || null, actor.uid, notes || null]
  );
  await writeAudit({ user: actor, action: 'CREATE_EXPENSE', entity: 'expenses', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

// ---------------------------------------------------------------- Budgets
async function listBudgets(period) {
  let sql = `
    SELECT b.*, ec.name AS category_name,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.category_id = b.category_id AND to_char(e.expense_date,'YYYY-MM') = b.period), 0) AS spent
    FROM budgets b JOIN expense_categories ec ON ec.id = b.category_id`;
  const params = [];
  if (period) { params.push(period); sql += ` WHERE b.period = $1`; }
  sql += ' ORDER BY b.period DESC, ec.name';
  const { rows } = await query(sql, params);
  return rows.map((r) => {
    const spent = Number(r.spent);
    const amount = Number(r.amount);
    return {
      ...r,
      spent,
      remaining: amount - spent,
      percent_used: amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0,
      over_budget: spent > amount,
    };
  });
}

async function upsertBudget({ categoryId, period, amount }, actor) {
  if (!categoryId || !period || amount === undefined) throw new AppError('categoryId, period and amount are required.');
  const { rows } = await query(
    `INSERT INTO budgets (category_id, period, amount, created_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (category_id, period) DO UPDATE SET amount = EXCLUDED.amount RETURNING *`,
    [categoryId, period, amount, actor.uid]
  );
  await writeAudit({ user: actor, action: 'SET_BUDGET', entity: 'budgets', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

// ---------------------------------------------------------------- Products / Inventory
async function listProducts() {
  const { rows } = await query("SELECT * FROM products WHERE status = 'ACTIVE' ORDER BY name");
  return rows;
}

async function createProduct(body, actor) {
  const { name, category, unit, purchasePrice, sellingPrice, quantityOnHand, minimumStock, supplier } = body;
  if (!name) throw new AppError('Product name is required.');
  const { rows } = await query(
    `INSERT INTO products (name, category, unit, purchase_price, selling_price, quantity_on_hand, minimum_stock, supplier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, category || null, unit || 'unit', purchasePrice || 0, sellingPrice || 0, quantityOnHand || 0, minimumStock || 0, supplier || null]
  );
  await writeAudit({ user: actor, action: 'CREATE_PRODUCT', entity: 'products', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

/** Stock purchase: increases quantity, logs the movement, and books a matching expense so it shows up in the income statement (spec §24, §13). */
async function recordStockPurchase({ productId, quantity, unitCost, supplier, expenseDate }, actor) {
  if (!productId || !quantity) throw new AppError('productId and quantity are required.');
  return withTransaction(async (client) => {
    const { rows: prodRows } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
    const product = prodRows[0];
    if (!product) throw new AppError('Product not found.', 404);

    const qty = Number(quantity);
    const cost = unitCost !== undefined ? Number(unitCost) : Number(product.purchase_price);
    await client.query('UPDATE products SET quantity_on_hand = quantity_on_hand + $1, updated_at = now() WHERE id = $2', [qty, productId]);
    await client.query(
      `INSERT INTO stock_movements (product_id, type, quantity, notes, recorded_by) VALUES ($1,'PURCHASE',$2,$3,$4)`,
      [productId, qty, `Stock purchase${supplier ? ' from ' + supplier : ''}`, actor.uid]
    );

    // Auto-book the matching expense (category "Stock Purchases") so it flows into reports.
    const { rows: catRows } = await client.query("SELECT id FROM expense_categories WHERE name = 'Stock Purchases' LIMIT 1");
    let categoryId = catRows[0]?.id;
    if (!categoryId) {
      const { rows: newCat } = await client.query("INSERT INTO expense_categories (name) VALUES ('Stock Purchases') RETURNING id");
      categoryId = newCat[0].id;
    }
    const reference = await nextId('EXP');
    const amount = qty * cost;
    await client.query(
      `INSERT INTO expenses (reference, category_id, description, amount, expense_date, payment_method, vendor, recorded_by, auto_generated)
       VALUES ($1,$2,$3,$4,$5,'CASH',$6,$7,true)`,
      [reference, categoryId, `Stock purchase: ${product.name} x${qty}`, amount, expenseDate || new Date().toISOString().slice(0, 10), supplier || product.supplier || null, actor.uid]
    );

    await writeAudit({ user: actor, action: 'STOCK_PURCHASE', entity: 'products', entityId: productId, after: { quantity: qty, amount } });
    return { ok: true, quantityAdded: qty, expenseBooked: amount };
  });
}

async function listStockMovements(productId) {
  const { rows } = await query('SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC', [productId]);
  return rows;
}

// ---------------------------------------------------------------- Sales (cash or credit)
async function listSales() {
  const { rows } = await query('SELECT * FROM sales ORDER BY sale_date DESC, created_at DESC LIMIT 2000');
  return rows;
}

async function getSaleItems(saleId) {
  const { rows } = await query(
    `SELECT si.*, p.name AS product_name FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = $1`,
    [saleId]
  );
  return rows;
}

/**
 * Record a sale. `items`: [{ productId, quantity, unitPrice }]. `amountPaid`
 * may be less than the total — the shortfall automatically becomes a Debt
 * (spec §25: credit sale -> stock decreases, debt created, never counted
 * as collected cash).
 */
async function createSale({ customerName, customerPhone, items, amountPaid, paymentMethod, saleDate, dueDate }, actor) {
  if (!Array.isArray(items) || !items.length) throw new AppError('At least one sale item is required.');

  return withTransaction(async (client) => {
    let total = 0;
    for (const it of items) {
      const { rows } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [it.productId]);
      const product = rows[0];
      if (!product) throw new AppError(`Product not found: ${it.productId}`, 404);
      if (Number(product.quantity_on_hand) < Number(it.quantity)) {
        throw new AppError(`Not enough stock for ${product.name}. In stock: ${product.quantity_on_hand}.`);
      }
      total += Number(it.quantity) * Number(it.unitPrice ?? product.selling_price);
    }

    const paid = Math.min(Number(amountPaid || 0), total);
    const status = paid <= 0 ? 'UNPAID' : paid < total ? 'PARTIALLY_PAID' : 'PAID';
    const saleNumber = await nextId('SALE');

    const { rows: saleRows } = await client.query(
      `INSERT INTO sales (sale_number, customer_name, customer_phone, total_amount, amount_paid, status, payment_method, sold_by, sale_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [saleNumber, customerName || 'Walk-in customer', customerPhone || null, total, paid, status, paymentMethod || 'CASH', actor.uid, saleDate || new Date().toISOString().slice(0, 10)]
    );
    const sale = saleRows[0];

    for (const it of items) {
      const { rows: prodRows } = await client.query('SELECT * FROM products WHERE id = $1', [it.productId]);
      const product = prodRows[0];
      const unitPrice = Number(it.unitPrice ?? product.selling_price);
      await client.query(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)',
        [sale.id, it.productId, it.quantity, unitPrice]
      );
      await client.query('UPDATE products SET quantity_on_hand = quantity_on_hand - $1, updated_at = now() WHERE id = $2', [it.quantity, it.productId]);
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, reference, recorded_by) VALUES ($1,'SALE',$2,$3,$4)`,
        [it.productId, -Math.abs(Number(it.quantity)), saleNumber, actor.uid]
      );
    }

    // Credit sale (fully or partially unpaid) -> create a Debt automatically.
    if (paid < total) {
      const balance = total - paid;
      const debtReference = await nextId('DEBT');
      await client.query(
        `INSERT INTO debts (reference, debtor_name, debtor_contact, description, sale_id, total_amount, amount_paid, due_date, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [debtReference, customerName || 'Walk-in customer', customerPhone || null, `Credit sale ${saleNumber}`, sale.id, total, paid, dueDate || null, actor.uid]
      );
    }

    await writeAudit({ user: actor, action: 'CREATE_SALE', entity: 'sales', entityId: sale.id, after: { total, paid, status } });
    return sale;
  });
}

// ---------------------------------------------------------------- Debts / credit register
function computeDebtStatus(total, paid, dueDate) {
  const t = Number(total);
  const p = Number(paid);
  if (p >= t) return 'PAID';
  if (dueDate && new Date(dueDate) < new Date() && p < t) return 'OVERDUE';
  if (p > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

/** Product/customer debts + unpaid staff salaries in one combined view (spec §18-20). */
async function listDebts({ status } = {}) {
  const { rows } = await query('SELECT * FROM debts ORDER BY created_at DESC');
  const productDebts = rows
    .map((d) => ({ ...d, status: computeDebtStatus(d.total_amount, d.amount_paid, d.due_date), kind: 'CUSTOMER_DEBT' }))
    .filter((d) => !status || d.status === status || (status === 'UNPAID' && d.status === 'OVERDUE'));

  const salaries = await payroll.listUnpaidSalaries();
  const salaryDebts = salaries.map((s) => ({
    id: s.id,
    kind: 'SALARY_DEBT',
    debtor_name: `${s.first_name} ${s.last_name}`,
    description: `Salary — ${s.period}${s.department_name ? ' (' + s.department_name + ')' : ''}`,
    total_amount: s.net_salary,
    amount_paid: s.amount_paid,
    balance: s.balance,
    due_date: s.due_date,
    status: s.status === 'PARTIALLY_PAID' ? 'PARTIALLY_PAID' : 'UNPAID',
    employee_id: s.employee_id,
    employee_code: s.employee_code,
    period: s.period,
  })).filter((d) => !status || d.status === status);

  return { productDebts, salaryDebts };
}

async function createDebt({ debtorName, debtorContact, description, totalAmount, amountPaid, dueDate, notes }, actor) {
  if (!debtorName || !totalAmount) throw new AppError('debtorName and totalAmount are required.');
  const reference = await nextId('DEBT');
  const { rows } = await query(
    `INSERT INTO debts (reference, debtor_name, debtor_contact, description, total_amount, amount_paid, due_date, notes, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [reference, debtorName, debtorContact || null, description || null, totalAmount, amountPaid || 0, dueDate || null, notes || null, actor.uid]
  );
  await writeAudit({ user: actor, action: 'CREATE_DEBT', entity: 'debts', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

/** Record a payment against a customer/product debt. Once fully paid the debt drops off the outstanding list but stays in history (spec §19). */
async function recordDebtPayment({ debtId, amount, paymentMethod }, actor) {
  if (!amount || amount <= 0) throw new AppError('A positive payment amount is required.');
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM debts WHERE id = $1 FOR UPDATE', [debtId]);
    const debt = rows[0];
    if (!debt) throw new AppError('Debt not found.', 404);
    const remaining = Number(debt.total_amount) - Number(debt.amount_paid);
    if (amount > remaining + 0.01) throw new AppError('Payment exceeds the outstanding balance.');

    const newPaid = Number(debt.amount_paid) + Number(amount);
    const status = computeDebtStatus(debt.total_amount, newPaid, debt.due_date);
    await client.query('UPDATE debts SET amount_paid = $1, status = $2, updated_at = now() WHERE id = $3', [newPaid, status, debtId]);
    await client.query('INSERT INTO debt_payments (debt_id, amount, payment_method, recorded_by) VALUES ($1,$2,$3,$4)', [debtId, amount, paymentMethod || 'CASH', actor.uid]);
    await writeAudit({ user: actor, action: 'PAY_DEBT', entity: 'debts', entityId: debtId, after: { amount, newPaid, status } });
    const { rows: updated } = await client.query('SELECT * FROM debts WHERE id = $1', [debtId]);
    return updated[0];
  });
}

// ---------------------------------------------------------------- Income statement / reports
/**
 * Everything a Manager needs for a period: school-fee income (from real
 * SUCCESSFUL payments — never from invoice totals, since those may be
 * unpaid), cash collected from sales, total expenses (including salaries
 * paid), and net profit/loss. All computed live from the ledger.
 */
async function incomeStatement({ from, to }) {
  if (!from || !to) throw new AppError('from and to dates are required (YYYY-MM-DD).');

  const [feeIncome, salesIncome, expenseRows, salariesPaid, debtsCollected] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'SUCCESSFUL' AND paid_at::date BETWEEN $1 AND $2`, [from, to]),
    query(`SELECT COALESCE(SUM(amount_paid),0) AS total FROM sales WHERE sale_date BETWEEN $1 AND $2`, [from, to]),
    query(`SELECT ec.name AS category, COALESCE(SUM(e.amount),0) AS total FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
           WHERE e.expense_date BETWEEN $1 AND $2 GROUP BY ec.name ORDER BY total DESC`, [from, to]),
    query(`SELECT COALESCE(SUM(pi.amount_paid),0) AS total FROM payroll_items pi WHERE pi.paid_at::date BETWEEN $1 AND $2`, [from, to]),
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM debt_payments WHERE paid_at::date BETWEEN $1 AND $2`, [from, to]),
  ]);

  const totalFeeIncome = Number(feeIncome.rows[0].total);
  const totalSalesIncome = Number(salesIncome.rows[0].total);
  const totalDebtCollections = Number(debtsCollected.rows[0].total);
  const totalIncome = totalFeeIncome + totalSalesIncome + totalDebtCollections;

  const expenseBreakdown = expenseRows.rows.map((r) => ({ category: r.category, total: Number(r.total) }));
  const totalOperatingExpenses = expenseBreakdown.reduce((s, r) => s + r.total, 0);
  const totalSalariesPaid = Number(salariesPaid.rows[0].total);
  const totalExpenses = totalOperatingExpenses + totalSalariesPaid;

  return {
    from, to,
    income: {
      schoolFees: totalFeeIncome,
      sales: totalSalesIncome,
      debtCollections: totalDebtCollections,
      total: totalIncome,
    },
    expenses: {
      byCategory: expenseBreakdown,
      salariesPaid: totalSalariesPaid,
      total: totalExpenses,
    },
    netProfitLoss: totalIncome - totalExpenses,
  };
}

function monthRange(period) {
  const [y, m] = period.split('-').map(Number);
  const from = `${period}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${period}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

async function monthlyReport(period) {
  if (!period) throw new AppError('period (YYYY-MM) is required.');
  const { from, to } = monthRange(period);
  return { period, ...(await incomeStatement({ from, to })) };
}

async function yearlyReport(year) {
  if (!year) throw new AppError('year is required.');
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const overall = await incomeStatement({ from, to });

  const months = [];
  for (let m = 1; m <= 12; m += 1) {
    const period = `${year}-${String(m).padStart(2, '0')}`;
    months.push(monthlyReport(period));
  }
  const monthly = await Promise.all(months);
  return { year, overall, monthly };
}

async function customPeriodReport({ from, to }) {
  return incomeStatement({ from, to });
}

// ---------------------------------------------------------------- Reports Center
async function reportsCenterSummary({ from, to } = {}) {
  const range = from && to ? { from, to } : (() => {
    const now = new Date();
    return { from: `${now.getFullYear()}-01-01`, to: now.toISOString().slice(0, 10) };
  })();

  const [statement, debtsData, stockRows] = await Promise.all([
    incomeStatement(range),
    listDebts({}),
    query(`SELECT p.name, p.quantity_on_hand, p.minimum_stock, p.selling_price,
             (p.quantity_on_hand * p.purchase_price) AS stock_value
           FROM products p WHERE p.status = 'ACTIVE' ORDER BY p.name`),
  ]);

  const outstandingDebts = debtsData.productDebts.filter((d) => d.status !== 'PAID');
  const outstandingSalaries = debtsData.salaryDebts;
  const lowStock = stockRows.rows.filter((r) => Number(r.quantity_on_hand) <= Number(r.minimum_stock));
  const totalStockValue = stockRows.rows.reduce((s, r) => s + Number(r.stock_value || 0), 0);

  return {
    range,
    financial: statement,
    debts: {
      outstandingCount: outstandingDebts.length,
      outstandingTotal: outstandingDebts.reduce((s, d) => s + Number(d.balance), 0),
      outstandingSalariesCount: outstandingSalaries.length,
      outstandingSalariesTotal: outstandingSalaries.reduce((s, d) => s + Number(d.balance), 0),
    },
    stock: {
      totalValue: totalStockValue,
      lowStockItems: lowStock,
    },
  };
}

module.exports = {
  listExpenseCategories, createExpenseCategory,
  listExpenses, createExpense,
  listBudgets, upsertBudget,
  listProducts, createProduct, recordStockPurchase, listStockMovements,
  listSales, getSaleItems, createSale,
  listDebts, createDebt, recordDebtPayment,
  incomeStatement, monthlyReport, yearlyReport, customPeriodReport,
  reportsCenterSummary,
};
