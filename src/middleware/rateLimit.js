const buckets = new Map();

const rateLimit = ({ windowMs = 60 * 1000, max = 60, keyPrefix = 'global' } = {}) => {
  return (req, res, next) => {
    const identity = req.user?.userId || req.ip || req.headers['x-forwarded-for'] || 'anonymous';
    const key = `${keyPrefix}:${identity}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }

    return next();
  };
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = rateLimit;
