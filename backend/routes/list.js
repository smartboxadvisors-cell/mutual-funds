// routes/list.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const InstrumentHolding = require('../models/InstrumentHolding');
const Scheme = require('../models/Scheme');
const Issuer = require('../models/issuer.model');
const MasterRating = require('../models/MasterRating');

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

    // Enrich with issuer names from MasterRating
    const isins = [...new Set(items.map(item => item.isin).filter(Boolean))];
    const issuerMap = {};
    
    if (isins.length > 0) {
      const masterRatings = await MasterRating.find({ isin: { $in: isins } })
        .select('isin issuerName rating ratingGroup')
        .lean();
      
      masterRatings.forEach(mr => {
        issuerMap[mr.isin] = {
          issuerName: mr.issuerName,
          rating: mr.rating,
          ratingGroup: mr.ratingGroup,
        };
      });
    }

    const transformedItems = items.map((item) => {
      const issuerInfo = issuerMap[item.isin] || {};
      
      return {
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
        rating: issuerInfo.rating || item.rating,
        ytm: item.other?.YTM || null,
        _modifiedTime: item.updatedAt,
        instrumentType: item.instrumentType,
        sector: item.sector,
        issuer: issuerInfo.issuerName || item.issuer || 'N/A',
        ratingGroup: issuerInfo.ratingGroup || null,
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

    // Step 1: Determine if search is an ISIN or issuer name
    const searchTerm = issuerSearch.trim();
    const isISINSearch = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(searchTerm);
    
    let matchingIsins = [];
    
    if (searchTerm) {
      if (isISINSearch) {
        // Direct ISIN search - just use the ISIN
        matchingIsins = [searchTerm.toUpperCase()];
      } else {
        // Issuer name search - find matching ISINs from master data
        const searchRegex = { $regex: escapeRegex(searchTerm), $options: 'i' };
        
        // Search in Issuer model (company field)
        const matchingIssuersFromIssuer = await Issuer.find({
          company: searchRegex,
        })
          .select('isin company')
          .lean();
        
        // Search in MasterRating model (issuerName field)
        const matchingIssuersFromRating = await MasterRating.find({
          issuerName: searchRegex,
        })
          .select('isin issuerName')
          .lean();
        
        // Combine ISINs from both sources
        const isinsFromIssuer = matchingIssuersFromIssuer.map(issuer => issuer.isin);
        const isinsFromRating = matchingIssuersFromRating.map(issuer => issuer.isin);
        matchingIsins = [...new Set([...isinsFromIssuer, ...isinsFromRating])];
        
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
    }

    // Step 2: Build filter for InstrumentHolding
    const filter = {};
    if (matchingIsins.length > 0) {
      filter.isin = { $in: matchingIsins };
    }
    // If no search term, show all (or we could filter for only items with ISIN)
    if (!searchTerm) {
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

    // Step 3: Fetch issuer details for all ISINs - prioritize MasterRating
    const isins = [...new Set(items.map(item => item.isin).filter(Boolean))];
    const issuerMap = {};
    
    console.log(`[Investor Data] Processing ${isins.length} unique ISINs`);
    
    if (isins.length > 0) {
      // Get data from MasterRating model (PRIMARY SOURCE)
      const masterRatings = await MasterRating.find({ isin: { $in: isins } })
        .select('isin issuerName rating ratingGroup metadata')
        .lean();
      
      console.log(`[Investor Data] Found ${masterRatings.length} issuers from MasterRating`);
      if (masterRatings.length > 0) {
        console.log(`[Investor Data] Sample MasterRating:`, {
          isin: masterRatings[0].isin,
          issuerName: masterRatings[0].issuerName,
          rating: masterRatings[0].rating
        });
      }
      
      // Get data from Issuer model (FALLBACK)
      const issuers = await Issuer.find({ isin: { $in: isins } })
        .select('isin company sector rating')
        .lean();
      
      console.log(`[Investor Data] Found ${issuers.length} issuers from Issuer model`);
      
      // Build issuer map - MasterRating as primary source
      masterRatings.forEach(mr => {
        issuerMap[mr.isin] = {
          company: mr.issuerName,  // Use MasterRating issuerName as primary
          rating: mr.rating || mr.metadata?.rating,
          ratingGroup: mr.ratingGroup || mr.metadata?.ratingGroup,
          sector: null,  // Will be filled from Issuer model if available
        };
      });
      
      // Merge with Issuer data (only fill missing fields, don't override)
      issuers.forEach(issuer => {
        if (!issuerMap[issuer.isin]) {
          // If not in MasterRating, use Issuer data
          issuerMap[issuer.isin] = {
            company: issuer.company,
            sector: issuer.sector,
            rating: issuer.rating,
            ratingGroup: null,
          };
        } else {
          // If in MasterRating, only add sector from Issuer (don't override name or rating)
          issuerMap[issuer.isin].sector = issuer.sector;
        }
      });
    }

    // Step 4: Transform items with issuer data from master list
    const transformedItems = items.map((item) => {
      const issuerInfo = issuerMap[item.isin] || {};
      
      // Debug first item
      if (items.indexOf(item) === 0) {
        console.log(`[Investor Data] First transformed item:`, {
          isin: item.isin,
          issuerFromMap: issuerInfo.company,
          issuerFromItem: item.issuer
        });
      }
      
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
        ratingGroup: issuerInfo.ratingGroup || null,
        sector: issuerInfo.sector || item.sector || 'N/A',
        instrumentType: item.instrumentType || 'N/A',
        pct_to_nav: item.navPercent || 0,
        coupon: item.coupon || null,
      };
    });
    
    console.log(`[Investor Data] Returning ${transformedItems.length} transformed items`);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items: transformedItems,
      debug: {
        totalIsins: isins.length,
        foundInMasterRating: Object.keys(issuerMap).length,
        sampleIsin: isins[0],
        sampleIssuerInfo: issuerMap[isins[0]] || null,
      }
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
    const searchRegex = search.trim() 
      ? { $regex: escapeRegex(search.trim()), $options: 'i' }
      : null;
    
    // Get issuers from both models - prioritize MasterRating
    const [issuersFromRating, issuersFromIssuer] = await Promise.all([
      MasterRating.find(searchRegex ? { issuerName: searchRegex } : {})
        .select('issuerName')
        .sort({ issuerName: 1 })
        .limit(20)
        .lean(),
      Issuer.find(searchRegex ? { company: searchRegex } : {})
        .select('company')
        .sort({ company: 1 })
        .limit(20)
        .lean()
    ]);
    
    // Combine with MasterRating first (primary source), then add from Issuer
    const namesFromRating = issuersFromRating
      .map(issuer => issuer.issuerName)
      .filter(name => name && name.trim());
    
    const namesFromIssuer = issuersFromIssuer
      .map(issuer => issuer.company)
      .filter(name => name && name.trim());
    
    // Deduplicate (case-insensitive) - MasterRating names take priority
    const seenNames = new Set();
    const uniqueNames = [];
    
    // Add MasterRating names first
    namesFromRating.forEach(name => {
      const lowerName = name.toLowerCase();
      if (!seenNames.has(lowerName)) {
        seenNames.add(lowerName);
        uniqueNames.push(name);
      }
    });
    
    // Add Issuer names only if not already present
    namesFromIssuer.forEach(name => {
      const lowerName = name.toLowerCase();
      if (!seenNames.has(lowerName)) {
        seenNames.add(lowerName);
        uniqueNames.push(name);
      }
    });
    
    // Sort and limit
    const finalNames = uniqueNames
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 20);

    res.json({ issuers: finalNames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'error', error: error.message });
  }
});

// Test route: Get sample issuer data from MasterRating
router.get('/investor-data/sample', async (req, res) => {
  try {
    const sampleIssuers = await MasterRating.find({ issuerName: { $ne: '', $exists: true } })
      .select('isin issuerName rating ratingGroup metadata')
      .limit(10)
      .lean();

    res.json({
      count: sampleIssuers.length,
      samples: sampleIssuers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'error', error: error.message });
  }
});

// Diagnostic route: Compare ISINs between InstrumentHolding and MasterRating
router.get('/investor-data/diagnostic', async (req, res) => {
  try {
    // Get 10 ISINs from InstrumentHolding
    const holdings = await InstrumentHolding.find({ isin: { $exists: true, $ne: null, $ne: '' } })
      .select('isin issuer instrumentName')
      .limit(10)
      .lean();

    const holdingIsins = holdings.map(h => h.isin);
    
    // Try to find them in MasterRating
    const matchedInMasterRating = await MasterRating.find({ isin: { $in: holdingIsins } })
      .select('isin issuerName')
      .lean();

    // Get some sample ISINs from MasterRating
    const sampleMasterRatings = await MasterRating.find({ issuerName: { $ne: '', $exists: true } })
      .select('isin issuerName')
      .limit(5)
      .lean();

    res.json({
      holdingIsins: holdings.map(h => ({
        isin: h.isin,
        length: h.isin?.length,
        issuer: h.issuer,
        instrumentName: h.instrumentName
      })),
      matchedInMasterRating: matchedInMasterRating.length,
      matched: matchedInMasterRating,
      sampleFromMasterRating: sampleMasterRatings.map(mr => ({
        isin: mr.isin,
        length: mr.isin?.length,
        issuerName: mr.issuerName
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'error', error: error.message });
  }
});

module.exports = router;
