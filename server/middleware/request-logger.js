module.exports = function requestLogger(req, res, next) {
  console.log('➡️ Incoming:', req.method, req.url);
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log('⬅️ Done:', req.method, req.url, res.statusCode, `${duration}ms`);
  });
  next();
};

