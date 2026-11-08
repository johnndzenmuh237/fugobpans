const router = require('express').Router();
const { attendanceController: ctrl } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, STAFF_ROLES, needs } = require('../middleware/roles');

router.get('/roster', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.roster);
router.post('/mark-self', requireAuth, allowRoles(...STAFF_ROLES), ctrl.markSelf);
router.post('/mark-manual', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.markManual);
router.get('/history/:employeeId', requireAuth, ctrl.history);
router.get('/today-summary', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.todaySummary);
router.post('/run-sweep', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.runSweep);

module.exports = router;
