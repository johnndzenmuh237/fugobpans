const router = require('express').Router();
const ctrl = require('../controllers/reconciliationController');
const { requireAuth } = require('../middleware/auth');
const { FINANCE_ROLES, allowRoles, requirePermission } = require('../middleware/roles');

// Mounted at /api/reconciliation. Owner always; others only if the Owner ticked "Reconcile with MTN / Orange statements".
router.use(requireAuth, allowRoles(...FINANCE_ROLES), requirePermission('reconcile_payments'));
router.post('/import', ctrl.importFile);
router.get('/imports', ctrl.imports);
router.get('/report', ctrl.report);
router.post('/resolve', ctrl.resolve);
module.exports = router;
