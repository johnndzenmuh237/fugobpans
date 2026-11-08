const router = require('express').Router();
const { asyncHandler: h, AppError } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/roles');
const dash = require('../services/dashboardService');
const reports = require('../services/reportService');

router.use(requireAuth);

router.get('/overview', h(async (req, res) => res.json(await dash.overview(req.user))));
router.get('/property-performance', requirePermission('analytics', 'properties', 'finance'), h(async (req, res) => res.json(await dash.propertyPerformance(req.user))));
router.get('/category-performance', requirePermission('analytics', 'properties', 'finance'), h(async (req, res) => res.json(await dash.categoryPerformance(req.user))));
router.get('/trends', requirePermission('analytics', 'finance'), h(async (req, res) => res.json(await dash.trends(req.user, req.query.months))));
router.get('/insights', requirePermission('analytics'), h(async (req, res) => res.json(await dash.insights(req.user))));
router.get('/reminders', requirePermission('tenants', 'payments', 'finance'), h(async (req, res) => res.json(await dash.reminders(req.user))));

router.get('/search', h(async (req, res) => res.json(await reports.globalSearch(req.user, req.query.q))));

router.get('/reports', h(async (req, res) => res.json(Object.entries(reports.REPORTS).filter(([k]) => reports.canRun(req.user, k)).map(([key, v]) => ({ key, title: v.title })))));
router.get('/reports/:key', h(async (req, res) => {
  if (!reports.REPORTS[req.params.key]) throw new AppError('Unknown report.', 404);
  if (!reports.canRun(req.user, req.params.key)) throw new AppError('You do not have access to that report.', 403);
  const report = await reports.run(req.user, req.params.key, req.query);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.key}-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(reports.toCsv(report));
  }
  return res.json({ title: report.title, columns: report.columns.map(([key, label]) => ({ key, label })), rows: report.rows });
}));

module.exports = router;
