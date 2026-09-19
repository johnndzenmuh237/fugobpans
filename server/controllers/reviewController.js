const { asyncHandler } = require('../middleware/error-handler');
const svc = require('../services/reviewService');

const submit = asyncHandler(async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
  const result = await svc.submitReview(req.body, ip);
  // Always respond the same way whether trapped by the honeypot or genuinely
  // saved — a spam bot should never be able to tell the difference.
  res.status(201).json({ ok: true, message: 'Thank you! Your review will appear once approved by the school.' });
});

const listPublic = asyncHandler(async (req, res) => res.json(await svc.listPublicReviews()));

const listAll = asyncHandler(async (req, res) => res.json(await svc.listAllReviews(req.query.status)));
const moderate = asyncHandler(async (req, res) => res.json(await svc.moderateReview(req.params.id, req.body, req.user)));
const edit = asyncHandler(async (req, res) => res.json(await svc.editReview(req.params.id, req.body, req.user)));
const remove = asyncHandler(async (req, res) => { await svc.deleteReview(req.params.id, req.user); res.json({ ok: true }); });

module.exports = { submit, listPublic, listAll, moderate, edit, remove };
