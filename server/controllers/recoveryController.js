const { asyncHandler } = require('../middleware/error-handler');
const svc = require('../services/recoveryService');
module.exports = {
  request: asyncHandler(async (req, res) => res.json(await svc.requestRecovery(req.body?.phone, req))),
  verify: asyncHandler(async (req, res) => res.json(await svc.verifyRecovery(req.body?.phone, req.body?.code, req))),
  lookupRequest: asyncHandler(async (req, res) => res.json(await svc.requestLookupOtp(req.body?.trackingCode, req))),
  lookupVerify: asyncHandler(async (req, res) => res.json(await svc.verifyLookupOtp(req.body?.trackingCode, req.body?.code))),
};
