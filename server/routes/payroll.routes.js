const router = require('express').Router();
const { payrollController: ctrl } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, needs } = require('../middleware/roles');

router.post('/salary', requireAuth, allowRoles(ROLES.MANAGER), needs('finance'), ctrl.updateSalary);
router.post('/runs', requireAuth, allowRoles(ROLES.MANAGER), needs('finance'), ctrl.generate);
router.get('/runs', requireAuth, allowRoles(ROLES.MANAGER), needs('finance'), ctrl.listRuns);
router.get('/runs/:runId/items', requireAuth, allowRoles(ROLES.MANAGER), needs('finance'), ctrl.listItems);
router.patch('/items/:itemId/pay', requireAuth, allowRoles(ROLES.MANAGER), needs('finance'), ctrl.markPaid);

module.exports = router;
