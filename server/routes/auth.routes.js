const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');
const { publicWriteLimiter, authLimiter } = require('../middleware/rate-limit');

router.post('/login', authLimiter, ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.post('/users', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createUser);
router.post('/change-password', requireAuth, ctrl.changePassword);
router.post('/forgot-password', publicWriteLimiter, ctrl.forgotPassword);
router.post('/reset-password', publicWriteLimiter, ctrl.resetPassword);

module.exports = router;
