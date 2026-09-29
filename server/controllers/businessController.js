const { asyncHandler } = require('../middleware/error-handler');
const business = require('../services/businessService');
const payroll = require('../services/payrollService');

module.exports = {
  // Expense categories
  listExpenseCategories: asyncHandler(async (req, res) => res.json(await business.listExpenseCategories())),
  createExpenseCategory: asyncHandler(async (req, res) => res.status(201).json(await business.createExpenseCategory(req.body, req.user))),

  // Expenses
  listExpenses: asyncHandler(async (req, res) => res.json(await business.listExpenses(req.query))),
  createExpense: asyncHandler(async (req, res) => res.status(201).json(await business.createExpense(req.body, req.user))),

  // Budgets
  listBudgets: asyncHandler(async (req, res) => res.json(await business.listBudgets(req.query.period))),
  upsertBudget: asyncHandler(async (req, res) => res.status(201).json(await business.upsertBudget(req.body, req.user))),

  // Products / inventory
  listProducts: asyncHandler(async (req, res) => res.json(await business.listProducts())),
  createProduct: asyncHandler(async (req, res) => res.status(201).json(await business.createProduct(req.body, req.user))),
  recordStockPurchase: asyncHandler(async (req, res) => res.status(201).json(await business.recordStockPurchase(req.body, req.user))),
  listStockMovements: asyncHandler(async (req, res) => res.json(await business.listStockMovements(req.params.productId))),

  // Sales
  listSales: asyncHandler(async (req, res) => res.json(await business.listSales())),
  getSaleItems: asyncHandler(async (req, res) => res.json(await business.getSaleItems(req.params.saleId))),
  createSale: asyncHandler(async (req, res) => res.status(201).json(await business.createSale(req.body, req.user))),

  // Debts (customer/product credit + unpaid salaries)
  listDebts: asyncHandler(async (req, res) => res.json(await business.listDebts(req.query))),
  createDebt: asyncHandler(async (req, res) => res.status(201).json(await business.createDebt(req.body, req.user))),
  recordDebtPayment: asyncHandler(async (req, res) => res.json(await business.recordDebtPayment({ ...req.body, debtId: req.params.debtId }, req.user))),
  paySalaryDebt: asyncHandler(async (req, res) => res.json(await payroll.markPayrollItemPaid(req.params.itemId, req.user, req.body?.amount))),

  // Reports
  incomeStatement: asyncHandler(async (req, res) => res.json(await business.incomeStatement(req.query))),
  monthlyReport: asyncHandler(async (req, res) => res.json(await business.monthlyReport(req.query.period))),
  yearlyReport: asyncHandler(async (req, res) => res.json(await business.yearlyReport(req.query.year))),
  customPeriodReport: asyncHandler(async (req, res) => res.json(await business.customPeriodReport(req.query))),
  reportsCenterSummary: asyncHandler(async (req, res) => res.json(await business.reportsCenterSummary(req.query))),
};
