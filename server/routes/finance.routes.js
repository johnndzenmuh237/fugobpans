const router = require('express').Router();
const { asyncHandler: h } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, requirePermission } = require('../middleware/roles');
const svc = require('../services/financeService');

router.use(requireAuth);
const fin = requirePermission('finance');

router.get('/expense-categories', fin, h(async (req, res) => res.json(await svc.listExpenseCategories())));
router.post('/expense-categories', fin, h(async (req, res) => res.status(201).json(await svc.createExpenseCategory(req.body, req.user))));
router.get('/expenses', fin, h(async (req, res) => res.json(await svc.listExpenses(req.user, req.query))));
router.post('/expenses', fin, h(async (req, res) => res.status(201).json(await svc.createExpense(req.body, req.user))));

router.get('/budgets', fin, h(async (req, res) => res.json(await svc.listBudgets(req.query.period))));
router.post('/budgets', allowRoles(ROLES.ADMIN, ROLES.ACCOUNTANT), h(async (req, res) => res.json(await svc.upsertBudget(req.body, req.user))));

router.get('/debts', fin, h(async (req, res) => res.json(await svc.listDebts(req.user, req.query))));
router.post('/debts', fin, h(async (req, res) => res.status(201).json(await svc.createDebt(req.body, req.user))));
router.post('/debts/:id/pay', fin, h(async (req, res) => res.json(await svc.recordDebtPayment(req.params.id, req.body, req.user))));
router.get('/arrears', requirePermission('finance', 'payments', 'tenants'), h(async (req, res) => res.json(await svc.rentArrears(req.user, req.query))));

router.get('/income-statement', fin, h(async (req, res) => res.json(await svc.incomeStatement(req.user, req.query))));

module.exports = router;
