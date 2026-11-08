const router = require('express').Router();
const { asyncHandler: h } = require('../middleware/error-handler');
const { publicWriteLimiter } = require('../middleware/rate-limit');
const svc = require('../services/publicService');
const settings = require('../services/settingsService');

router.get('/listings', h(async (req, res) => res.json(await svc.listListings(req.query))));
router.get('/listings/:id', h(async (req, res) => res.json(await svc.getListing(req.params.id))));
router.get('/categories', h(async (req, res) => res.json(await svc.listPublicCategories())));
router.get('/settings', h(async (req, res) => res.json(await settings.getPublicSettings())));
router.post('/inquiries', publicWriteLimiter, h(async (req, res) => {
  await svc.submitInquiry(req.body, req.headers['x-forwarded-for'] || req.socket?.remoteAddress);
  res.status(201).json({ ok: true, message: 'Thank you! Our team will contact you shortly.' });
}));

module.exports = router;
