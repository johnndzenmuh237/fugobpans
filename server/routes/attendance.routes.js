const router = require('express').Router();
const { attendanceController: ctrl } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, STAFF_ROLES } = require('../middleware/roles');

router.get('/roster', requireAuth, allowRoles(ROLES.MANAGER), ctrl.roster);
router.post('/mark-self', requireAuth, allowRoles(...STAFF_ROLES), ctrl.markSelf);
router.post('/mark-manual', requireAuth, allowRoles(ROLES.MANAGER), ctrl.markManual);
router.get('/history/:employeeId', requireAuth, ctrl.history);
router.get('/today-summary', requireAuth, allowRoles(ROLES.MANAGER), ctrl.todaySummary);
router.post('/run-sweep', requireAuth, allowRoles(ROLES.MANAGER), ctrl.runSweep);

module.exports = router;
