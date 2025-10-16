// routes/list.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const InstrumentHolding = require('../models/InstrumentHolding');
const Scheme = require('../models/Scheme');
const Issuer = require('../models/issuer.model');

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

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function buildImportsFilter(query = {}) {
  const {
    scheme = '',
    schemeId = '',
    instrument = '',
    isin = '',
    rating = '',
    ratingContains = '',
    ratings = [],
    from = '',
    to = '',
    quantityMin,
    quantityMax,
    pctToNavMin,
    pctToNavMax,
    mvMin,
    mvMax,
    ytmMin,
    ytmMax,
    modifiedFrom = '',
    modifiedTo = '',
    search = '',
  } = query;

  const filter = {};
  let hasNoMatch = false;

  const addRegex = (field, val) => {
    if (!val || !String(val).trim()) return;
    filter[field] = { $regex: String(val).trim(), $options: 'i' };
  };

  const addRange = (field, min, max, cast = Number) => {
    const hasMin = min !== undefined && min !== null && String(min) !== '';
    const hasMax = max !== undefined && max !== null && String(max) !== '';
    if (!hasMin && !hasMax) return;
    filter[field] = filter[field] || {};
    if (hasMin) filter[field].$gte = cast(min);
    if (hasMax) filter[field].$lte = cast(max);
  };

  const toObjectId = (val) => {
    try {
      if (val && mongoose.Types.ObjectId.isValid(val)) {
        return new mongoose.Types.ObjectId(val);
      }
    } catch (_err) {
      // ignore invalid ids
    }
    return null;
  };

  const directSchemeId = toObjectId(schemeId);
  if (schemeId && !directSchemeId) {
    hasNoMatch = true;
  }
  if (directSchemeId) {
    filter.schemeId = directSchemeId;
  }

  if (!hasNoMatch && scheme && String(scheme).trim()) {
    const schemeMatches = await Scheme.find({
      name: { $regex: String(scheme).trim(), $options: 'i' },
    })
      .select('_id')
      .lean();

    if (schemeMatches.length === 0) {
      hasNoMatch = true;
    } else {
      const schemeIds = schemeMatches.map((s) => s._id);
      if (filter.schemeId && !(filter.schemeId.$in)) {
        const matchesDirect = schemeIds.some((id) => id.equals(filter.schemeId));
        if (!matchesDirect) {
          hasNoMatch = true;
        }
      } else if (filter.schemeId?.$in) {
        filter.schemeId.$in = filter.schemeId.$in.filter((id) =>
          schemeIds.some((sid) => sid.equals(id))
        );
        if (filter.schemeId.$in.length === 0) hasNoMatch = true;
      } else {
        filter.schemeId = { $in: schemeIds };
      }
    }
  }

  if (hasNoMatch) {
    filter._id = { $exists: false };
    return { filter, hasNoMatch };
  }

  addRegex('instrumentName', instrument);
  addRegex('isin', isin);

  const ratingsArray = Array.isArray(ratings)
    ? ratings
    : typeof ratings === 'string' && ratings
    ? [ratings]
    : [];

  const trimmedRatingContains = typeof ratingContains === 'string' ? ratingContains.trim() : '';
  const trimmedRating = typeof rating === 'string' ? rating.trim() : '';

  if (ratingsArray.length > 0) {
    const ratingRegexes = ratingsArray
      .map((r) => (r && r.trim() ? new RegExp(escapeRegex(r.trim()), 'i') : null))
      .filter(Boolean);

    if (trimmedRatingContains) {
      ratingRegexes.push(new RegExp(escapeRegex(trimmedRatingContains), 'i'));
    }

    if (ratingRegexes.length > 0) {
      filter.rating = { $in: ratingRegexes };
    }
  } else {
    const searchTerm = trimmedRatingContains || trimmedRating;
    if (searchTerm) {
      filter.rating = {
        $regex: escapeRegex(searchTerm),
        $options: 'i',
      };
    }
  }

  addRange('quantity', quantityMin, quantityMax, Number);
  addRange('navPercent', pctToNavMin, pctToNavMax, Number);
  addRange('marketValue', mvMin, mvMax, Number);

  if (ytmMin || ytmMax) {
    const hasMin = ytmMin !== undefined && ytmMin !== null && String(ytmMin) !== '';
    const hasMax = ytmMax !== undefined && ytmMax !== null && String(ytmMax) !== '';
    if (hasMin || hasMax) {
      filter['other.YTM'] = filter['other.YTM'] || {};
      if (hasMin) filter['other.YTM'].$gte = Number(ytmMin);
      if (hasMax) filter['other.YTM'].$lte = Number(ytmMax);
    }
  }

  if (!hasNoMatch && (from || to)) {
    const range = {};
    if (from) range.$gte = new Date(from);
    if (to) {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      range.$lte = t;
    }

    const schemesInRange = await Scheme.find({ reportDate: range }).select('_id').lean();
    if (schemesInRange.length === 0) {
      hasNoMatch = true;
    } else {
      const schemeIds = schemesInRange.map((s) => s._id);
      if (filter.schemeId && !(filter.schemeId.$in)) {
        const matchesDirect = schemeIds.some((id) => id.equals(filter.schemeId));
        if (!matchesDirect) hasNoMatch = true;
      } else if (filter.schemeId?.$in) {
        filter.schemeId.$in = filter.schemeId.$in.filter((id) =>
          schemeIds.some((sid) => sid.equals(id))
        );
        if (filter.schemeId.$in.length === 0) hasNoMatch = true;
      } else {
        filter.schemeId = { $in: schemeIds };
      }
    }
  }

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

  const trimmedSearch = typeof search === 'string' ? search.trim() : '';
  if (trimmedSearch) {
    const searchRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
    const orConditions = [
      { instrumentName: searchRegex },
      { isin: searchRegex },
      { rating: searchRegex },
      { issuer: searchRegex },
    ];

    const matchingSchemes = await Scheme.find({ name: searchRegex }).select('_id').lean();
    if (matchingSchemes.length > 0) {
      orConditions.push({
        schemeId: { $in: matchingSchemes.map((s) => s._id) },
      });
    }

    if (filter.$or && Array.isArray(filter.$or)) {
      filter.$or = filter.$or.concat(orConditions);
    } else {
      filter.$or = orConditions;
    }
  }

  if (hasNoMatch) {
    filter._id = { $exists: false };
  }

  return { filter, hasNoMatch };
}

router.get('/', (_req, res) => {
  res.send('working');
});

router.get('/imports', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;

    const { filter, hasNoMatch } = await buildImportsFilter(req.query);
    if (hasNoMatch) {
      return res.json({
        page,
        limit,
        total: 0,
        totalPages: 1,
        items: [],
      });
    }

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

    const transformedItems = items.map((item) => ({
      _id: item._id,
      scheme_name: item.schemeId?.name || '',
      instrument_name: item.instrumentName || '',
      quantity: item.quantity,
      pct_to_nav: item.navPercent,
      market_value: item.marketValue,
      report_date: item.schemeId?.reportDate
        ? new Date(item.schemeId.reportDate).toLocaleDateString()
        : '',
      isin: item.isin,
      rating: item.rating,
      ytm: item.other?.YTM || null,
      _modifiedTime: item.updatedAt,
      instrumentType: item.instrumentType,
      sector: item.sector,
      issuer: item.issuer,
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

router.get('/imports/scheme-summary', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const skip = (page - 1) * limit;

    const { filter, hasNoMatch } = await buildImportsFilter(req.query);
    if (hasNoMatch) {
      return res.json({
        page,
        limit,
        totalSchemes: 0,
        totalPages: 1,
        totalMarketValue: 0,
        totalQuantity: 0,
        holdingsCount: 0,
        topScheme: null,
        items: [],
      });
    }

    const pipeline = [
      { $match: filter },
      {
        $group: {
          _id: '$schemeId',
          schemeId: { $first: '$schemeId' },
          totalMarketValue: { $sum: { $ifNull: ['$marketValue', 0] } },
          totalQuantity: { $sum: { $ifNull: ['$quantity', 0] } },
          holdingsCount: { $sum: 1 },
          pctNavSum: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$navPercent', null] }, { $ne: ['$navPercent', undefined] }] },
                '$navPercent',
                0,
              ],
            },
          },
          pctNavCount: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$navPercent', null] }, { $ne: ['$navPercent', undefined] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'schemes',
          localField: 'schemeId',
          foreignField: '_id',
          as: 'scheme',
        },
      },
      { $unwind: { path: '$scheme', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          schemeName: { $ifNull: ['$scheme.name', 'Unnamed Scheme'] },
          averagePctNav: {
            $cond: [{ $gt: ['$pctNavCount', 0] }, { $divide: ['$pctNavSum', '$pctNavCount'] }, null],
          },
          reportDate: '$scheme.reportDate',
        },
      },
      { $sort: { totalMarketValue: -1, schemeName: 1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          summary: [
            {
              $group: {
                _id: null,
                totalSchemes: { $sum: 1 },
                totalMarketValue: { $sum: '$totalMarketValue' },
                totalQuantity: { $sum: '$totalQuantity' },
                totalHoldings: { $sum: '$holdingsCount' },
              },
            },
          ],
          top: [{ $limit: 1 }],
        },
      },
    ];

    const aggregated = await InstrumentHolding.aggregate(pipeline);
    const facetResult = aggregated[0] || {};
    const data = facetResult.data || [];
    const summaryDoc = (facetResult.summary && facetResult.summary[0]) || {
      totalSchemes: 0,
      totalMarketValue: 0,
      totalQuantity: 0,
      totalHoldings: 0,
    };
    const topDoc = (facetResult.top && facetResult.top[0]) || null;

    const totalSchemes = summaryDoc.totalSchemes || 0;
    const totalPages = Math.max(1, Math.ceil(totalSchemes / limit));

    const items = data.map((item) => ({
      schemeId: item.schemeId ? String(item.schemeId) : '',
      scheme: item.schemeName || 'Unnamed Scheme',
      reportDate: item.reportDate || null,
      totalMarketValue: item.totalMarketValue || 0,
      totalQuantity: item.totalQuantity || 0,
      holdingsCount: item.holdingsCount || 0,
      averagePctNav: item.averagePctNav,
    }));

    const topScheme = topDoc
      ? {
          schemeId: topDoc.schemeId ? String(topDoc.schemeId) : '',
          scheme: topDoc.schemeName || 'Unnamed Scheme',
          totalMarketValue: topDoc.totalMarketValue || 0,
        }
      : null;

    res.json({
      page,
      limit,
      totalSchemes,
      totalPages,
      totalMarketValue: summaryDoc.totalMarketValue || 0,
      totalQuantity: summaryDoc.totalQuantity || 0,
      holdingsCount: summaryDoc.totalHoldings || 0,
      topScheme,
      items,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'error', error: error.message });
  }
});

// New route: Get investor/issuer data with proper issuer lookup from master list
router.get('/investor-data', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;
    const issuerSearch = req.query.issuer || '';

    // Step 1: Find matching issuers from the Issuer (master list) collection
    let matchingIsins = [];
    if (issuerSearch.trim()) {
      const matchingIssuers = await Issuer.find({
        company: { $regex: escapeRegex(issuerSearch.trim()), $options: 'i' },
      })
        .select('isin company')
        .lean();
      
      matchingIsins = matchingIssuers.map(issuer => issuer.isin);
      
      // If no matching issuers found, return empty result
      if (matchingIsins.length === 0) {
        return res.json({
          page,
          limit,
          total: 0,
          totalPages: 1,
          items: [],
        });
      }
    }

    // Step 2: Build filter for InstrumentHolding
    const filter = {};
    if (matchingIsins.length > 0) {
      filter.isin = { $in: matchingIsins };
    }
    // If no search term, show all (or we could filter for only items with ISIN)
    if (!issuerSearch.trim()) {
      filter.isin = { $exists: true, $ne: null, $ne: '' };
    }

    const sort = { isin: 1, updatedAt: -1, _id: -1 };

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

    // Step 3: Fetch issuer details for all ISINs in the results
    const isins = [...new Set(items.map(item => item.isin).filter(Boolean))];
    const issuerMap = {};
    
    if (isins.length > 0) {
      const issuers = await Issuer.find({ isin: { $in: isins } })
        .select('isin company sector rating')
        .lean();
      
      issuers.forEach(issuer => {
        issuerMap[issuer.isin] = issuer;
      });
    }

    // Step 4: Transform items with issuer data from master list
    const transformedItems = items.map((item) => {
      const issuerInfo = issuerMap[item.isin] || {};
      
      return {
        _id: item._id,
        issuer: issuerInfo.company || item.issuer || 'N/A',
        scheme_name: item.schemeId?.name || '',
        instrument_name: item.instrumentName || '',
        isin: item.isin || 'N/A',
        quantity: item.quantity || 0,
        market_value: item.marketValue || 0,
        maturity_date: item.maturityDate ? new Date(item.maturityDate).toLocaleDateString() : 'N/A',
        report_date: item.schemeId?.reportDate
          ? new Date(item.schemeId.reportDate).toLocaleDateString()
          : '',
        rating: issuerInfo.rating || item.rating || 'N/A',
        sector: issuerInfo.sector || item.sector || 'N/A',
        instrumentType: item.instrumentType || 'N/A',
        pct_to_nav: item.navPercent || 0,
        coupon: item.coupon || null,
      };
    });

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

// New route: Get unique issuers from master list (for autocomplete/suggestions)
router.get('/investor-data/issuers', async (req, res) => {
  try {
    const search = req.query.search || '';
    const filter = {};
    
    if (search.trim()) {
      filter.company = { $regex: escapeRegex(search.trim()), $options: 'i' };
    }
    
    // Get issuers from the master list (Issuer model)
    const issuers = await Issuer.find(filter)
      .select('company')
      .sort({ company: 1 })
      .limit(20)
      .lean();
    
    // Extract company names
    const issuerNames = issuers
      .map(issuer => issuer.company)
      .filter(company => company && company.trim());

    res.json({ issuers: issuerNames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'error', error: error.message });
  }
});

module.exports = router;
