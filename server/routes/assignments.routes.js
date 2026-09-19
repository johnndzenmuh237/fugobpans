const router = require('express').Router();
const ctrl = require('../controllers/assignmentController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');

// Teacher — create/manage assignments for classes they're actually assigned to.
router.post('/', requireAuth, allowRoles(ROLES.TEACHER), ctrl.create);
router.get('/mine', requireAuth, allowRoles(ROLES.TEACHER), ctrl.listMine);
router.patch('/:id', requireAuth, allowRoles(ROLES.TEACHER), ctrl.update);
router.delete('/:id', requireAuth, allowRoles(ROLES.TEACHER), ctrl.remove);

// Student — read-only, always scoped to their own class server-side.
router.get('/my-class', requireAuth, allowRoles(ROLES.STUDENT), ctrl.listForStudent);

module.exports = router;
