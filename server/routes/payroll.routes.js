const router = require('express').Router();
const { payrollController: ctrl } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');

router.post('/salary', requireAuth, allowRoles(ROLES.MANAGER), ctrl.updateSalary);
router.post('/runs', requireAuth, allowRoles(ROLES.MANAGER), ctrl.generate);
router.get('/runs', requireAuth, allowRoles(ROLES.MANAGER), ctrl.listRuns);
router.get('/runs/:runId/items', requireAuth, allowRoles(ROLES.MANAGER), ctrl.listItems);
router.patch('/items/:itemId/pay', requireAuth, allowRoles(ROLES.MANAGER), ctrl.markPaid);

module.exports = router;
