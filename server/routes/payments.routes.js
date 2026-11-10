const router = require('express').Router();
const ctrl = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/auth');
const { FINANCE_ROLES, allowRoles, needs, requirePermission } = require('../middleware/roles');
const { webhookLimiter } = require('../middleware/rate-limit');

router.post('/create', ctrl.createOnlinePayment); // public: parent paying an invoice, no login
router.get('/verify/:providerReference', ctrl.verifyOnlinePayment);
router.post('/webhook', webhookLimiter, ctrl.webhook);
router.post('/office', requireAuth, allowRoles(...FINANCE_ROLES), requirePermission('issue_receipts'), ctrl.recordOfficePayment);
router.get('/', requireAuth, allowRoles(...FINANCE_ROLES), needs('finance'), ctrl.listPayments);

module.exports = router;
