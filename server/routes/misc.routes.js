const router = require('express').Router();
const ctrl = require('../controllers/miscController');
const { dashboardController } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, needs, topLevelOnly } = require('../middleware/roles');

router.get('/dashboard/overview', requireAuth, allowRoles(ROLES.MANAGER), dashboardController.overview);
router.get('/dashboard/registrations', requireAuth, allowRoles(ROLES.MANAGER, ROLES.ACCOUNTANT), dashboardController.registrations);
router.get('/dashboard/categories', requireAuth, allowRoles(ROLES.MANAGER), dashboardController.categoryBreakdown);

router.get('/notifications', requireAuth, ctrl.listNotifications);
router.post('/notifications', requireAuth, allowRoles(ROLES.MANAGER), needs('announcements'), ctrl.sendNotification);
router.get('/notifications/sent', requireAuth, allowRoles(ROLES.MANAGER), needs('announcements'), ctrl.sentNotifications);
router.get('/notifications/unread-count', requireAuth, ctrl.unreadCount);
router.post('/notifications/read-all', requireAuth, ctrl.markAllNotificationsRead);
router.patch('/notifications/:id/read', requireAuth, ctrl.markNotificationRead);
router.get('/audit-logs', requireAuth, allowRoles(ROLES.MANAGER), needs('reports'), ctrl.listAuditLogs);
router.get('/settings', ctrl.getSettings); // public: powers the public site's contact info
router.patch('/settings', requireAuth, topLevelOnly, ctrl.updateSettings);

module.exports = router;
