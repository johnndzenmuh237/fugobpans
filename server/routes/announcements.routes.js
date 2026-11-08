const router = require('express').Router();
const ctrl = require('../controllers/announcementController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, STAFF_ROLES, allowRoles, needs } = require('../middleware/roles');

// PUBLIC — parents/anyone can read announcements without logging in.
router.get('/public', ctrl.listPublic);

router.get('/mine', requireAuth, ctrl.listMine);
router.get('/', requireAuth, allowRoles(...STAFF_ROLES), ctrl.listAll);
router.post('/', requireAuth, allowRoles(ROLES.MANAGER), needs('announcements'), ctrl.create);
router.patch('/:id/status', requireAuth, allowRoles(ROLES.MANAGER), needs('announcements'), ctrl.setStatus);

module.exports = router;
