const Joi = require('joi');
const PortfolioService = require('../services/portfolio.service');

// ============ Validation Schemas ============

const transactionSchema = Joi.object({
  type: Joi.string().valid('BUY', 'SELL').required(),
  isin: Joi.string().required().trim(),
  company: Joi.string().required().trim(),
  share_count: Joi.number().integer().min(1).required(),
  price: Joi.number().min(0).required(),
  trade_date: Joi.date().iso().required(),
  source: Joi.string().optional(),
});

const priceUpdateSchema = Joi.object({
  isin: Joi.string().required().trim(),
  current_price: Joi.number().min(0).required(),
  as_of: Joi.date().iso().optional(),
});

const bulkPriceSchema = Joi.array().items(priceUpdateSchema).min(1);

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  sort: Joi.string().optional(),
});

// ============ Controllers ============

/**
 * GET /api/portfolio
 * Returns complete portfolio: { holdings, sold, summary }
 */
const getPortfolio = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const data = await PortfolioService.buildPortfolio(userId);
    res.json(data);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/portfolio/holdings
 * Returns only holdings array
 */
const getHoldings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Validate pagination params
    const { error, value } = paginationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const holdings = await PortfolioService.getHoldings(userId);
    
    // Apply pagination
    const { page, limit } = value;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = holdings.slice(start, end);

    res.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: holdings.length,
        totalPages: Math.ceil(holdings.length / limit),
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/portfolio/sold
 * Returns only sold transactions
 */
const getSold = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Validate pagination params
    const { error, value } = paginationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const sold = await PortfolioService.getSold(userId);
    
    // Apply pagination
    const { page, limit } = value;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = sold.slice(start, end);

    res.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: sold.length,
        totalPages: Math.ceil(sold.length / limit),
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/portfolio/transactions
 * Add a new BUY or SELL transaction
 */
const addTransaction = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Validate request body
    const { error, value } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const transaction = await PortfolioService.addTransaction(userId, value);
    res.status(201).json({
      message: 'Transaction added successfully',
      transaction,
    });
  } catch (e) {
    // Handle validation errors from service (e.g., oversell)
    if (e.message.includes('Cannot sell')) {
      return res.status(400).json({ error: e.message });
    }
    next(e);
  }
};

/**
 * POST /api/portfolio/prices
 * Bulk upsert price snapshots (admin/utility endpoint)
 */
const bulkUpsertPrices = async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = bulkPriceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await PortfolioService.bulkUpsertPrices(value);
    res.json({
      message: 'Price snapshots updated successfully',
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/portfolio/issuers/:isin
 * Get issuer details by ISIN (for modal display)
 */
const getIssuerByIsin = async (req, res, next) => {
  try {
    const { isin } = req.params;
    if (!isin) {
      return res.status(400).json({ error: 'ISIN parameter required' });
    }

    const issuer = await PortfolioService.getIssuerByIsin(isin);
    res.json(issuer);
  } catch (e) {
    if (e.message.includes('not found')) {
      return res.status(404).json({ error: e.message });
    }
    next(e);
  }
};

module.exports = {
  getPortfolio,
  getHoldings,
  getSold,
  addTransaction,
  bulkUpsertPrices,
  getIssuerByIsin,
};

