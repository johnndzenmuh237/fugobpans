const router = require('express').Router();
const ctrl = require('../controllers/leaveController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');

// Any logged-in staff member (Teacher/Employee/Accountant) submits/views their OWN requests.
const STAFF = [ROLES.TEACHER, ROLES.EMPLOYEE, ROLES.ACCOUNTANT];
router.post('/mine', requireAuth, allowRoles(...STAFF), ctrl.submitMyLeave);
router.get('/mine', requireAuth, allowRoles(...STAFF), ctrl.listMyLeave);

// Manager reviews and decides on everyone's requests.
router.get('/', requireAuth, allowRoles(ROLES.MANAGER), ctrl.listAll);
router.patch('/:leaveId/decide', requireAuth, allowRoles(ROLES.MANAGER), ctrl.decide);

module.exports = router;
