// server.js
require('dotenv').config();
const express = require('express');
const connectDb = require('./config/db');
const listRouter = require('./routes/list');
const authRouter = require('./routes/auth');

const app = express();
app.set('trust proxy', 1);

// ---------- Allowed origins setup ----------
const STATIC_ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// explicit locals + prod + any additionally provided in env
const BASE_ALLOWED = new Set([
  'http://localhost:5173',
  'http://localhost:5175',
  'https://pp-capital.vercel.app',
  ...STATIC_ALLOWED,
]);

// Current deployment origin (Vercel sets VERCEL_URL without protocol)
const CURRENT_DEPLOY_ORIGIN = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : null;

// Project-scoped preview matcher: pp-capital-xxxxx.vercel.app
function isProjectPreview(origin) {
  try {
    const host = new URL(origin).hostname; // e.g. pp-capital-5n7x.vercel.app
    return host.endsWith('.vercel.app') && host.startsWith('pp-capital');
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return (
    BASE_ALLOWED.has(origin) ||
    (CURRENT_DEPLOY_ORIGIN && origin === CURRENT_DEPLOY_ORIGIN) ||
    isProjectPreview(origin)
  );
}

// ---------- CORS: handle preflight and normal requests ----------
app.use((req, res, next) => {
  const origin = req.header('Origin');
  
  // Handle OPTIONS (preflight) requests
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) return res.status(403).end();
    
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.header('Access-Control-Request-Headers') || 'Content-Type, Authorization'
    );
    res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
    return res.status(204).end();
  }
  
  // For normal requests: set ACAO so browser accepts the response
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  
  next();
});

// ---------- Body parsing ----------
app.use(express.json());

// ---------- DB connection ----------
connectDb(); // make sure this reads MONGODB_URI & MONGODB_DB

// ---------- Routes ----------
app.use('/api/auth', authRouter);
app.use('/api/instruments', require('./routes/instruments'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api', listRouter);

// ---------- Health ----------
app.get('/', (req, res) => res.json({ ok: true }));

// ---------- 404 ----------
app.use((req, res) =>
  res.status(404).json({ error: 'Not found', path: req.originalUrl })
);

// ---------- Boot ----------
// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`server is listening on port ${PORT}`));
}

// Export for Vercel serverless
module.exports = app;
