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
const miscRoutes = require('./routes/misc.routes');

const app = express();
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
const allowedOrigins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true, // needed so the httpOnly session cookie is sent cross-origin
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api', registrationRoutes); // /api/registrations, /api/students
app.use('/api/academics', academicsRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api', miscRoutes); // /api/dashboard/*, /api/notifications, /api/audit-logs, /api/settings

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use(errorHandler);

module.exports = app;
