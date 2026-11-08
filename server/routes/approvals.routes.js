const router = require('express').Router();
const c = require('../controllers/approvalsController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, needs } = require('../middleware/roles');
router.get('/expenses', requireAuth, allowRoles(ROLES.MANAGER), needs('finance'), c.listExpenses);
router.post('/expenses/:id', requireAuth, allowRoles(ROLES.MANAGER), needs('finance'), c.decideExpense);
module.exports = router;
