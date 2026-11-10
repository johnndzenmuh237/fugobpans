const { asyncHandler, AppError } = require('../middleware/error-handler');
const svc = require('../services/verificationService');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idParam = (req) => { if (!uuid.test(req.params.id)) throw new AppError('Invalid payment id.', 400); return req.params.id; };

module.exports = {
  submitPublic: asyncHandler(async (req, res) => res.status(201).json(await svc.submitPublicPayment(req.body, req))),
  pending: asyncHandler(async (req, res) => res.json(await svc.listPending())),
  history: asyncHandler(async (req, res) => res.json(await svc.listHistory(req.query))),
  paymentHistory: asyncHandler(async (req, res) => res.json(await svc.paymentHistory(idParam(req)))),
  evidence: asyncHandler(async (req, res) => {
    const ev = await svc.getEvidence(idParam(req));
    res.setHeader('Content-Type', ev.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.send(ev.data);
  }),
  confirm: asyncHandler(async (req, res) => res.json(await svc.verifyPayment(idParam(req), req.user, req.body || {}, req))),
  reject: asyncHandler(async (req, res) => res.json(await svc.rejectPayment(idParam(req), req.user, req.body?.reason, req))),
  requestInfo: asyncHandler(async (req, res) => res.json(await svc.requestInfo(idParam(req), req.user, req.body?.message, req))),
};
