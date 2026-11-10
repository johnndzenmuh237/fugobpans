const router = require('express').Router();
const ctrl = require('../controllers/reminderController');
const { requireAuth } = require('../middleware/auth');
const { FINANCE_ROLES, allowRoles, requirePermission } = require('../middleware/roles');

const staff = [requireAuth, allowRoles(...FINANCE_ROLES)];
router.get('/settings', ...staff, requirePermission('manage_reminders'), ctrl.getSettings);
router.put('/settings', ...staff, requirePermission('manage_reminders'), ctrl.updateSettings);
router.get('/preview', ...staff, requirePermission('manage_reminders'), ctrl.preview);
router.post('/run', ...staff, requirePermission('manage_reminders'), ctrl.run);
router.post('/manual', ...staff, requirePermission('manage_reminders'), ctrl.manual);
router.get('/outbox', ...staff, requirePermission('manage_reminders'), ctrl.outbox);
router.get('/installments/:feeStructureId', ...staff, requirePermission('modify_fees', 'manage_reminders'), ctrl.listInstallments);
router.put('/installments/:feeStructureId', ...staff, requirePermission('modify_fees'), ctrl.replaceInstallments);
router.post('/installments/:feeStructureId/apply', ...staff, requirePermission('modify_fees'), ctrl.applyInstallments);

module.exports = router;
