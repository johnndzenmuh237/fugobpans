const router = require('express').Router();
const ctrl = require('../controllers/registrationController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, STAFF_ROLES } = require('../middleware/roles');
const { publicWriteLimiter } = require('../middleware/rate-limit');

// PUBLIC — no account required (spec §2)
router.post('/registrations', publicWriteLimiter, ctrl.submit);

router.get('/registrations', requireAuth, allowRoles(...STAFF_ROLES), ctrl.listRegistrations);
router.get('/students', requireAuth, allowRoles(...STAFF_ROLES), ctrl.listStudents);

// IMPORTANT: /students/me must be declared before /students/:id so Express
// doesn't try to treat "me" as a UUID param.
router.get('/students/me', requireAuth, allowRoles(ROLES.STUDENT), ctrl.getMyProfile);
router.get('/students/:id', requireAuth, allowRoles(...STAFF_ROLES), ctrl.getStudentProfile);
router.patch('/students/:id/status', requireAuth, allowRoles(ROLES.MANAGER), ctrl.setStudentStatus);
router.post('/students/:id/login', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createStudentLogin);

module.exports = router;
