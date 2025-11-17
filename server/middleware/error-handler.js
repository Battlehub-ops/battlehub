module.exports = function errorHandler(err, req, res, next) {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'server_error' });
};

