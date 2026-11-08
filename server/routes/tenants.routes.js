const router = require('express').Router();
const { asyncHandler: h } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/roles');
const svc = require('../services/tenantService');

router.use(requireAuth);
router.get('/', requirePermission('tenants', 'payments', 'finance'), h(async (req, res) => res.json(await svc.listTenants(req.user, req.query))));
router.post('/', requirePermission('tenants'), h(async (req, res) => res.status(201).json(await svc.registerTenant(req.body, req.user))));
router.get('/:id', requirePermission('tenants', 'payments', 'finance'), h(async (req, res) => res.json(await svc.getTenantProfile(req.user, req.params.id))));
router.patch('/:id', requirePermission('tenants'), h(async (req, res) => res.json(await svc.updateTenant(req.params.id, req.body, req.user))));
router.post('/:id/move-out', requirePermission('tenants'), h(async (req, res) => res.json(await svc.moveOut(req.params.id, req.body, req.user))));
router.post('/:id/tracking-code', requirePermission('tenants'), h(async (req, res) => res.json(await svc.regenerateTrackingCode(req.params.id, req.user))));

module.exports = router;
