const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const publicWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
// Public tracking-code lookups: strict, so codes can't be brute-forced.
const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
// Login: slows password guessing from one IP (per-account lockout is in authController).
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// One-time-code endpoints (recovery / record verification): strict per IP; per-phone limits are enforced in the database as well.
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false });

module.exports = { otpLimiter, apiLimiter, publicWriteLimiter, webhookLimiter, lookupLimiter, authLimiter };
