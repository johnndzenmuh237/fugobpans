const router = require('express').Router();
const ctrl = require('../controllers/noteController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, STAFF_ROLES, allowRoles } = require('../middleware/roles');

router.post('/', requireAuth, allowRoles(ROLES.TEACHER, ROLES.MANAGER), ctrl.create);
router.get('/student/:studentId', requireAuth, allowRoles(...STAFF_ROLES), ctrl.listForStudent);

module.exports = router;
