function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isAppError = true;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.isAppError) return res.status(err.statusCode).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'A record with that value already exists.' });
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Something went wrong on our end. Please try again shortly.' });
}

module.exports = { asyncHandler, AppError, errorHandler };
