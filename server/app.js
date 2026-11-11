require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { errorHandler } = require('./middleware/error-handler');
const { apiLimiter } = require('./middleware/rate-limit');

const authRoutes = require('./routes/auth.routes');
const registrationRoutes = require('./routes/registration.routes');
const academicsRoutes = require('./routes/academics.routes');
const employeesRoutes = require('./routes/employees.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const payrollRoutes = require('./routes/payroll.routes');
const paymentsRoutes = require('./routes/payments.routes');
const resultsRoutes = require('./routes/results.routes');
const reviewsRoutes = require('./routes/reviews.routes');
const assignmentsRoutes = require('./routes/assignments.routes');
const miscRoutes = require('./routes/misc.routes');
const businessRoutes = require('./routes/business.routes');
const leaveRoutes = require('./routes/leave.routes');
const announcementsRoutes = require('./routes/announcements.routes');
const notesRoutes = require('./routes/notes.routes');
const lookupRoutes = require('./routes/lookup.routes');
const ownerRoutes = require('./routes/owner.routes');
const studentsExtraRoutes = require('./routes/students-extra.routes');
const platformRoutes = require('./routes/platform.routes');
const approvalsRoutes = require('./routes/approvals.routes');
const verificationRoutes = require('./routes/verification.routes');
const publicPaymentsRoutes = require('./routes/public-payments.routes');
const recoveryRoutes = require('./routes/recovery.routes');
const remindersRoutes = require('./routes/reminders.routes');
const reconciliationRoutes = require('./routes/reconciliation.routes');

const app = express();
// Render (and most hosts) sit behind a proxy. Without this every visitor looks like one IP,
// so the rate limiters would throttle the whole school together.
app.set('trust proxy', 1);

// Same defaults as before, plus blob: images so staff can view an uploaded payment screenshot when the site is served from here.
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'img-src': ["'self'", 'data:', 'blob:'] } } }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
const allowedOrigins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true, // needed so the httpOnly session cookie is sent cross-origin
}));
// Routes that carry files (payment screenshots, operator statements) need more than the 2 MB default, so they get
// their own JSON limit and are mounted BEFORE the global parser. They keep their own rate limiting / authentication.
app.use('/api/public-payments', apiLimiter, express.json({ limit: '6mb' }), publicPaymentsRoutes);
app.use('/api/reconciliation', apiLimiter, cookieParser(), express.json({ limit: '9mb' }), reconciliationRoutes);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/api', apiLimiter);

// Keep-alive target. Deliberately does NOT touch the database, so pinging it keeps Render awake
// without keeping Neon's compute running (Neon sleeps when idle, which saves your free hours).
// Add ?db=1 to also verify the database connection.
app.get('/api/health', async (req, res) => {
  if (req.query.db !== '1') return res.json({ ok: true, time: new Date().toISOString() });
  try { await require('./config/db').query('SELECT 1'); res.json({ ok: true, db: true, time: new Date().toISOString() }); }
  catch (e) { res.status(503).json({ ok: false, db: false }); }
});

app.use('/api/auth', authRoutes);
app.use('/api/approvals', approvalsRoutes); // expense approvals
app.use('/api', studentsExtraRoutes); // student update, lifecycle/history, discipline, student attendance
app.use('/api', registrationRoutes); // /api/registrations, /api/students
app.use('/api/academics', academicsRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/payments/manual', verificationRoutes); // verification queue, evidence, decisions, history (before /api/payments)
app.use('/api/payments', paymentsRoutes);
app.use('/api/recovery', recoveryRoutes); // public: tracking-number recovery by one-time code
app.use('/api/reminders', remindersRoutes); // fee reminders, messaging settings, instalment schedules
app.use('/api/results', resultsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/owner', ownerRoutes); // Owner/Director only: management accounts, school-wide control
app.use('/api/leave', leaveRoutes); // staff leave requests + manager decisions
app.use('/api/announcements', announcementsRoutes); // public + staff announcements
app.use('/api/notes', notesRoutes); // teacher student notes
app.use('/api/lookup', lookupRoutes); // public tracking-code lookups
app.use('/api/business', businessRoutes); // expenses, budgets, debts, sales, inventory, income statement
app.use('/api', platformRoutes); // parents, messages, terms, timetable, report cards
app.use('/api', miscRoutes); // /api/dashboard/*, /api/notifications, /api/audit-logs, /api/settings

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

// Optional: let this server also serve the website (set SERVE_FRONTEND=true). Not needed when the
// frontend is hosted on Firebase Hosting.
if (process.env.SERVE_FRONTEND === 'true') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../public'), {
    extensions: ['html'],
    // The service worker and manifest must never be served stale, or phones keep running old app code.
    setHeaders: (res, file) => { if (/[\\/](sw\.js|manifest\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); },
  }));
}
app.use(errorHandler);

module.exports = app;