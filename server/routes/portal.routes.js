const router = require('express').Router();
const { asyncHandler: h, AppError } = require('../middleware/error-handler');
const { portalLookupLimiter, publicWriteLimiter } = require('../middleware/rate-limit');
const svc = require('../services/portalService');
const { streamReceiptPdf } = require('../services/paymentService');

/** Tenant portal token travels in a header (it is NOT a staff session and unlocks exactly one tenant). */
function requirePortal(req, res, next) {
  const token = req.headers['x-portal-token'] || req.query.pt;
  if (!token) return next(new AppError('Please enter your tracking code again.', 401));
  try { req.tenantId = svc.verifyPortalToken(String(token)); next(); } catch (e) { next(e); }
}

router.post('/login', portalLookupLimiter, h(async (req, res) => res.json(await svc.portalLogin(req.body.code, req.body.phoneLast4))));

router.use(requirePortal);
router.get('/me', h(async (req, res) => res.json(await svc.loadPortalData(req.tenantId))));
router.get('/announcements', h(async (req, res) => res.json(await svc.tenantAnnouncements(req.tenantId))));
router.post('/payments', publicWriteLimiter, h(async (req, res) => res.status(201).json({ status: 'PENDING', payment: await svc.submitTenantPayment(req.tenantId, req.body) })));
router.post('/terms/:id/accept', h(async (req, res) => res.json(await svc.acceptTerms(req.tenantId, req.params.id, req.headers['x-forwarded-for'] || req.socket?.remoteAddress))));
router.post('/maintenance', publicWriteLimiter, h(async (req, res) => res.status(201).json(await svc.reportProblem(req.tenantId, req.body))));
router.get('/receipts/:paymentId', h(async (req, res) => {
  const receipt = await svc.portalReceipt(req.tenantId, req.params.paymentId);
  if (req.query.format === 'pdf') return streamReceiptPdf(receipt, res);
  return res.json(receipt);
}));

module.exports = router;
