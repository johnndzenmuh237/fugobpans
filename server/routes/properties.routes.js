const router = require('express').Router();
const { asyncHandler: h } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, requirePermission } = require('../middleware/roles');
const svc = require('../services/propertyService');

router.use(requireAuth);

// Properties & lands — any staff may read (scoped); Admin or a Manager with "properties" may write.
router.get('/properties', h(async (req, res) => res.json(await svc.listProperties(req.user, req.query))));
router.get('/properties/:id', h(async (req, res) => res.json(await svc.getProperty(req.user, req.params.id))));
router.post('/properties', requirePermission('properties'), h(async (req, res) => res.status(201).json(await svc.createProperty(req.body, req.user))));
router.patch('/properties/:id', requirePermission('properties'), h(async (req, res) => res.json(await svc.updateProperty(req.params.id, req.body, req.user))));

// Categories — everyone reads, ADMIN adds/edits ("admin can list more categories").
router.get('/categories', h(async (req, res) => res.json(await svc.listCategories({ appliesTo: req.query.appliesTo, includeInactive: req.query.all === 'true' }))));
router.post('/categories', allowRoles(ROLES.ADMIN), h(async (req, res) => res.status(201).json(await svc.createCategory(req.body, req.user))));
router.patch('/categories/:id', allowRoles(ROLES.ADMIN), h(async (req, res) => res.json(await svc.updateCategory(req.params.id, req.body, req.user))));

// Houses / units
router.get('/units', h(async (req, res) => res.json(await svc.listUnits(req.user, req.query))));
router.get('/units/:id', h(async (req, res) => res.json(await svc.getUnit(req.user, req.params.id))));
router.post('/units', requirePermission('properties'), h(async (req, res) => res.status(201).json(await svc.createUnit(req.body, req.user))));
router.post('/units/bulk', requirePermission('properties'), h(async (req, res) => res.status(201).json(await svc.bulkCreateUnits(req.body, req.user))));
router.patch('/units/:id', requirePermission('properties'), h(async (req, res) => res.json(await svc.updateUnit(req.params.id, req.body, req.user))));

// Landlords / owners — ADMIN manages; others read.
router.get('/landlords', allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT), h(async (req, res) => res.json(await svc.listLandlords())));
router.post('/landlords', allowRoles(ROLES.ADMIN), h(async (req, res) => res.status(201).json(await svc.createLandlord(req.body, req.user))));
router.patch('/landlords/:id', allowRoles(ROLES.ADMIN), h(async (req, res) => res.json(await svc.updateLandlord(req.params.id, req.body, req.user))));

module.exports = router;
