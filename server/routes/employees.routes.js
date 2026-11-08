const router = require('express').Router();
const { employeeController: ctrl } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, needs } = require('../middleware/roles');

router.get('/', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.list);

// IMPORTANT: /me must be declared before /:id so Express doesn't try to
// treat "me" as a UUID param. TEACHER/EMPLOYEE/ACCOUNTANT self-service (new feature).
router.get('/me', requireAuth, allowRoles(ROLES.TEACHER, ROLES.EMPLOYEE, ROLES.ACCOUNTANT), ctrl.getMe);
router.get('/:id', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.getOne);

router.post('/', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.create);
router.post('/:id/login', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.createLogin);
router.get('/meta/positions', requireAuth, ctrl.listPositions);
router.post('/meta/positions', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.createPosition);
router.get('/meta/departments', requireAuth, ctrl.listDepartments);
router.post('/meta/departments', requireAuth, allowRoles(ROLES.MANAGER), needs('teachers'), ctrl.createDepartment);

module.exports = router;
