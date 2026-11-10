const { asyncHandler } = require('../middleware/error-handler');
const svc = require('../services/reconciliationService');
module.exports = {
  importFile: asyncHandler(async (req, res) => res.status(201).json(await svc.importStatement(req.body || {}, req.user, req))),
  imports: asyncHandler(async (req, res) => res.json(await svc.listImports())),
  report: asyncHandler(async (req, res) => {
    const rep = await svc.report(req.query);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${req.query.provider}.csv"`);
      return res.send(`\uFEFF${svc.toCsv(rep)}`);
    }
    return res.json(rep);
  }),
  resolve: asyncHandler(async (req, res) => res.status(201).json(await svc.resolve(req.body || {}, req.user, req))),
};
