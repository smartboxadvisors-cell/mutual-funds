// routes/list.js
const express = require('express');
const router = express.Router();
const InstrumentHolding = require('../models/InstrumentHolding');
const Scheme = require('../models/Scheme');

const PROJECTION = {
  _id: 1,
  schemeId: 1,
  instrumentName: 1,
  instrumentType: 1,
  isin: 1,
  quantity: 1,
  marketValue: 1,
  navPercent: 1,
  maturityDate: 1,
  coupon: 1,
  rating: 1,
  sector: 1,
  issuer: 1,
  other: 1,
  createdAt: 1,
  updatedAt: 1
};

router.get('/', (_req, res) => {
  res.send('working');
});

router.get('/imports', async (req, res) => {
  try {
    // paging
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip  = (page - 1) * limit;

    // query params
    const {
      scheme       = '',
      instrument   = '',
      isin         = '',
      rating       = '',
      ratings      = [],  // NEW: array of ratings for multi-select
      from         = '',  // report date from (yyyy-mm-dd)
      to           = '',  // report date to   (yyyy-mm-dd)
      quantityMin,
      quantityMax,
      pctToNavMin,
      pctToNavMax,
      mvMin,           // market value min
      mvMax,           // market value max
      ytmMin,
      ytmMax,
      modifiedFrom = '',
      modifiedTo   = '',
    } = req.query;

    // helpers
    const addRegex = (field, val) => {
      if (!val || !String(val).trim()) return;
      // case-insensitive contains
      filter[field] = { $regex: String(val).trim(), $options: 'i' };
    };
    const addStartsWith = (field, val) => {
      if (!val || !String(val).trim()) return;
      // e.g., rating "AAA" should match "AAA (CE)"
      filter[field] = { $regex: `^${escapeRegex(String(val).trim())}`, $options: 'i' };
    };
    const addRange = (field, min, max, cast = Number) => {
      const hasMin = min !== undefined && min !== null && String(min) !== '';
      const hasMax = max !== undefined && max !== null && String(max) !== '';
      if (!hasMin && !hasMax) return;
      filter[field] = {};
      if (hasMin) filter[field].$gte = cast(min);
      if (hasMax) filter[field].$lte = cast(max);
    };
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // build filter
    const filter = {};
    
    // If scheme filter is provided, find matching schemeIds
    if (scheme && String(scheme).trim()) {
      const schemeFilter = { name: { $regex: String(scheme).trim(), $options: 'i' } };
      const matchingSchemes = await Scheme.find(schemeFilter).select('_id').lean();
      if (matchingSchemes.length > 0) {
        filter.schemeId = { $in: matchingSchemes.map(s => s._id) };
      } else {
        // No matching schemes, return empty result
        filter.schemeId = null;
      }
    }
    
    addRegex('instrumentName', instrument);
    addRegex('isin', isin);
    
    // Handle multiple ratings (NEW)
    const ratingsArray = Array.isArray(ratings) ? ratings : 
                        (typeof ratings === 'string' && ratings ? [ratings] : []);
    
    if (ratingsArray.length > 0) {
      // Use $in for multiple ratings with regex patterns
      filter.rating = {
        $in: ratingsArray.map(r => new RegExp(`^${escapeRegex(r)}`, 'i'))
      };
    } else if (rating) {
      // Fallback to single rating for backward compatibility
      filter.rating = {
        $regex: `^${escapeRegex(rating)}`,
        $options: 'i',
      };
    }
    
    // numeric ranges
    addRange('quantity', quantityMin, quantityMax, Number);
    addRange('navPercent', pctToNavMin, pctToNavMax, Number);
    addRange('marketValue', mvMin, mvMax, Number);
    
    // YTM is in other.YTM field
    if (ytmMin || ytmMax) {
      const hasMin = ytmMin !== undefined && ytmMin !== null && String(ytmMin) !== '';
      const hasMax = ytmMax !== undefined && ytmMax !== null && String(ytmMax) !== '';
      if (hasMin || hasMax) {
        filter['other.YTM'] = {};
        if (hasMin) filter['other.YTM'].$gte = Number(ytmMin);
        if (hasMax) filter['other.YTM'].$lte = Number(ytmMax);
      }
    }

    // report date range - filter by scheme's reportDate
    if (from || to) {
      const range = {};
      if (from) range.$gte = new Date(from);
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        range.$lte = t;
      }
      
      // Find schemes within the date range
      const schemesInRange = await Scheme.find({ reportDate: range }).select('_id').lean();
      if (schemesInRange.length > 0) {
        const schemeIds = schemesInRange.map(s => s._id);
        // If we already have a schemeId filter, intersect it
        if (filter.schemeId && filter.schemeId.$in) {
          filter.schemeId.$in = filter.schemeId.$in.filter(id => 
            schemeIds.some(sid => sid.equals(id))
          );
        } else if (filter.schemeId) {
          // Single schemeId filter exists
          if (!schemeIds.some(sid => sid.equals(filter.schemeId))) {
            filter.schemeId = null; // No match
          }
        } else {
          filter.schemeId = { $in: schemeIds };
        }
      } else {
        // No schemes in date range
        filter.schemeId = null;
      }
    }

    // modified date range (createdAt/updatedAt)
    if (modifiedFrom || modifiedTo) {
      const range = {};
      if (modifiedFrom) range.$gte = new Date(modifiedFrom);
      if (modifiedTo) {
        const t = new Date(modifiedTo);
        t.setHours(23, 59, 59, 999);
        range.$lte = t;
      }
      filter.updatedAt = range;
    }

    // sort
    const sort = { updatedAt: -1, _id: -1 };

    const [items, total] = await Promise.all([
      InstrumentHolding.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(PROJECTION)
        .populate('schemeId', 'name reportDate')
        .lean(),
      InstrumentHolding.countDocuments(filter),
    ]);

    // Transform data to match frontend expectations
    const transformedItems = items.map(item => ({
      _id: item._id,
      scheme_name: item.schemeId?.name || '',
      instrument_name: item.instrumentName || '',
      quantity: item.quantity,
      pct_to_nav: item.navPercent,
      market_value: item.marketValue,
      report_date: item.schemeId?.reportDate ? new Date(item.schemeId.reportDate).toLocaleDateString() : '',
      isin: item.isin,
      rating: item.rating,
      ytm: item.other?.YTM || null,
      _modifiedTime: item.updatedAt,
      instrumentType: item.instrumentType,
      sector: item.sector
    }));

    res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items: transformedItems,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'error', error: error.message });
  }
});

module.exports = router;
