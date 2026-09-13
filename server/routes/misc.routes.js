const router = require('express').Router();
const ctrl = require('../controllers/miscController');
const { dashboardController } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');

router.get('/dashboard/overview', requireAuth, allowRoles(ROLES.MANAGER), dashboardController.overview);
router.get('/dashboard/registrations', requireAuth, allowRoles(ROLES.MANAGER, ROLES.ACCOUNTANT), dashboardController.registrations);
router.get('/dashboard/categories', requireAuth, allowRoles(ROLES.MANAGER), dashboardController.categoryBreakdown);

router.get('/notifications', requireAuth, ctrl.listNotifications);
router.patch('/notifications/:id/read', requireAuth, ctrl.markNotificationRead);
router.get('/audit-logs', requireAuth, allowRoles(ROLES.MANAGER), ctrl.listAuditLogs);
router.get('/settings', ctrl.getSettings); // public: powers the public site's contact info
router.patch('/settings', requireAuth, allowRoles(ROLES.MANAGER), ctrl.updateSettings);

module.exports = router;
