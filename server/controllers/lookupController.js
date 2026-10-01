const { asyncHandler } = require('../middleware/error-handler');
const tracking = require('../services/trackingLookupService');

module.exports = {
  lookupStudent: asyncHandler(async (req, res) => res.json(await tracking.lookupStudentByTrackingCode(req.params.code))),
  lookupEmployee: asyncHandler(async (req, res) => res.json(await tracking.lookupEmployeeByTrackingCode(req.params.code))),
};
