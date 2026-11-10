const { asyncHandler } = require('../middleware/error-handler');
const svc = require('../services/reminderService');
module.exports = {
  getSettings: asyncHandler(async (req, res) => res.json(await svc.getSettings())),
  updateSettings: asyncHandler(async (req, res) => res.json(await svc.updateSettings(req.body || {}, req.user, req))),
  preview: asyncHandler(async (req, res) => res.json(await svc.preview())),
  run: asyncHandler(async (req, res) => res.json(await svc.run({ actor: req.user, req }))),
  manual: asyncHandler(async (req, res) => res.json(await svc.markManuallySent(req.body, req.user))),
  outbox: asyncHandler(async (req, res) => res.json(await svc.outbox(req.query.limit))),
  listInstallments: asyncHandler(async (req, res) => res.json(await svc.listInstallments(req.params.feeStructureId))),
  replaceInstallments: asyncHandler(async (req, res) => res.json(await svc.replaceInstallments(req.params.feeStructureId, req.body?.items, req.user, req))),
  applyInstallments: asyncHandler(async (req, res) => res.json(await svc.applyTemplateToExistingInvoices(req.params.feeStructureId, req.user, req))),
};
