const router = require('express').Router();
const { asyncHandler: h } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/roles');
const svc = require('../services/maintenanceService');

router.use(requireAuth, requirePermission('maintenance'));
router.get('/', h(async (req, res) => res.json(await svc.listRequests(req.user, req.query))));
router.post('/', h(async (req, res) => res.status(201).json(await svc.createRequest(req.body, req.user))));
router.patch('/:id', h(async (req, res) => res.json(await svc.updateRequest(req.params.id, req.body, req.user))));
router.get('/workers', h(async (req, res) => res.json(await svc.listWorkers())));
router.post('/workers', h(async (req, res) => res.status(201).json(await svc.createWorker(req.body, req.user))));

module.exports = router;
