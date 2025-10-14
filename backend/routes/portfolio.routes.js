const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolio.controller');
// Optional: Add auth middleware if you want to protect these routes
// const requireAuth = require('../middleware/requireAuth');

// ============ Portfolio Routes ============

/**
 * GET /api/portfolio
 * Returns complete portfolio with holdings, sold, and summary
 * Query params: userId (optional if req.user.id exists from auth middleware)
 */
router.get('/', portfolioController.getPortfolio);

/**
 * GET /api/portfolio/holdings
 * Returns only holdings array with pagination
 * Query params: userId, page, limit, sort
 */
router.get('/holdings', portfolioController.getHoldings);

/**
 * GET /api/portfolio/sold
 * Returns only sold transactions with pagination
 * Query params: userId, page, limit, sort
 */
router.get('/sold', portfolioController.getSold);

/**
 * POST /api/portfolio/transactions
 * Add a new BUY or SELL transaction
 * Body: { type, isin, company, share_count, price, trade_date, source? }
 */
router.post('/transactions', portfolioController.addTransaction);

/**
 * POST /api/portfolio/prices
 * Bulk upsert price snapshots (admin/utility)
 * Body: [{ isin, current_price, as_of? }, ...]
 */
router.post('/prices', portfolioController.bulkUpsertPrices);

/**
 * GET /api/portfolio/issuers/:isin
 * Get issuer metadata by ISIN (for modal display)
 */
router.get('/issuers/:isin', portfolioController.getIssuerByIsin);

module.exports = router;

