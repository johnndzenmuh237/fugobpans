const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');

router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.post('/users', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createUser);
router.post('/change-password', requireAuth, ctrl.changePassword);

module.exports = router;
