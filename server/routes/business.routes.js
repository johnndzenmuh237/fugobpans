const router = require('express').Router();
const ctrl = require('../controllers/businessController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, FINANCE_ROLES, allowRoles } = require('../middleware/roles');

// Expense categories — Manager configures, Accountant can view
router.get('/expense-categories', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.listExpenseCategories);
router.post('/expense-categories', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createExpenseCategory);

// Expenses
router.get('/expenses', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.listExpenses);
router.post('/expenses', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.createExpense);

// Budgets
router.get('/budgets', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.listBudgets);
router.post('/budgets', requireAuth, allowRoles(ROLES.MANAGER), ctrl.upsertBudget);

// Products / inventory
router.get('/products', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.listProducts);
router.post('/products', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createProduct);
router.post('/products/:productId/purchase', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.recordStockPurchase);
router.get('/products/:productId/movements', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.listStockMovements);

// Sales
router.get('/sales', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.listSales);
router.get('/sales/:saleId/items', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.getSaleItems);
router.post('/sales', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.createSale);

// Debts (customer/product credit + unpaid staff salaries)
router.get('/debts', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.listDebts);
router.post('/debts', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.createDebt);
router.post('/debts/:debtId/pay', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.recordDebtPayment);
router.patch('/salary-debts/:itemId/pay', requireAuth, allowRoles(ROLES.MANAGER), ctrl.paySalaryDebt);

// Reports
router.get('/income-statement', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.incomeStatement);
router.get('/reports/monthly', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.monthlyReport);
router.get('/reports/yearly', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.yearlyReport);
router.get('/reports/custom', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.customPeriodReport);
router.get('/reports/summary', requireAuth, allowRoles(...FINANCE_ROLES), ctrl.reportsCenterSummary);

module.exports = router;
