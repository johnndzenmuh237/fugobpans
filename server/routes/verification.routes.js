const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, FINANCE_ROLES, allowRoles, requirePermission } = require('../middleware/roles');

// Mounted at /api/payments/manual — staff only. The permission check runs on the server for every call.
const staff = [requireAuth, allowRoles(...FINANCE_ROLES)];
router.get('/pending', ...staff, requirePermission('approve_payments'), ctrl.pending);
router.get('/history', ...staff, requirePermission('approve_payments', 'view_financial_reports'), ctrl.history);
router.get('/:id/history', ...staff, requirePermission('approve_payments', 'view_financial_reports'), ctrl.paymentHistory);
router.get('/:id/evidence', ...staff, requirePermission('approve_payments', 'view_financial_reports'), ctrl.evidence);
router.post('/:id/confirm', ...staff, requirePermission('approve_payments'), ctrl.confirm);
router.post('/:id/reject', ...staff, requirePermission('approve_payments'), ctrl.reject);
router.post('/:id/request-info', ...staff, requirePermission('approve_payments'), ctrl.requestInfo);

module.exports = router;
