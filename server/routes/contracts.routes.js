const router = require('express').Router();
const { asyncHandler: h } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, requirePermission } = require('../middleware/roles');
const svc = require('../services/contractService');

router.use(requireAuth);
router.get('/', requirePermission('contracts', 'tenants'), h(async (req, res) => res.json(await svc.listContracts(req.user, req.query))));
router.post('/:id/renew', requirePermission('contracts'), h(async (req, res) => res.status(201).json(await svc.renewContract(req.params.id, req.body, req.user))));
router.post('/:id/remind', requirePermission('contracts'), h(async (req, res) => res.json(await svc.sendContractReminder(req.params.id, req.user))));

// Terms & Conditions — create/edit/publish is ADMIN only (spec §11); managers can read.
router.get('/terms', requirePermission('contracts', 'tenants'), h(async (req, res) => res.json(await svc.listTerms())));
router.post('/terms', allowRoles(ROLES.ADMIN), h(async (req, res) => res.status(201).json(await svc.createTerms(req.body, req.user))));
router.patch('/terms/:id', allowRoles(ROLES.ADMIN), h(async (req, res) => res.json(await svc.updateTerms(req.params.id, req.body, req.user))));
router.post('/terms/:id/publish', allowRoles(ROLES.ADMIN), h(async (req, res) => res.json(await svc.publishTerms(req.params.id, req.user))));

module.exports = router;
