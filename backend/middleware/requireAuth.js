module.exports = function requireAuth(req, res, next) {
  const hdr = req.get('authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;

  // Accept the same token your /auth/login returns
  if (token === 'authenticated') return next();

  return res.status(401).json({ message: 'Unauthorized' });
};
