// routes/instruments.js
const express = require('express');
const router = express.Router();
const Scheme = require('../models/Scheme');
const InstrumentHolding = require('../models/InstrumentHolding');

// GET /api/instruments/schemes - Return all schemes sorted by reportDate desc, name asc
router.get('/schemes', async (req, res) => {
  try {
    const schemes = await Scheme.find({})
      .sort({ reportDate: -1, name: 1 })
      .lean();
    
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

// GET /api/instruments - Get paginated instruments with filtering and sorting
router.get('/', async (req, res) => {
  try {
    const {
      schemeId,
      page = 1,
      limit = 50,
      search = '',
      sort = '',
      filters = '{}'
    } = req.query;

    if (!schemeId) {
      return res.status(400).json({ error: 'schemeId is required' });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const skip = (pageNum - 1) * limitNum;

    // Build MongoDB filter
    const filter = { schemeId };

    // Text search on instrumentName (case-insensitive regex)
    if (search && search.trim()) {
      filter.instrumentName = { $regex: search.trim(), $options: 'i' };
    }

    // Parse additional filters
    let parsedFilters = {};
    try {
      parsedFilters = JSON.parse(filters);
    } catch (e) {
      // Invalid JSON, ignore filters
    }

    // Apply parsed filters
    for (const [fieldName, filterValue] of Object.entries(parsedFilters)) {
      if (typeof filterValue === 'string' && filterValue.trim()) {
        // String field - regex search
        filter[fieldName] = { $regex: filterValue.trim(), $options: 'i' };
      } else if (typeof filterValue === 'object' && filterValue !== null) {
        // Range filter
        const rangeFilter = {};
        if (filterValue.min !== undefined && filterValue.min !== null && filterValue.min !== '') {
          rangeFilter.$gte = Number(filterValue.min);
        }
        if (filterValue.max !== undefined && filterValue.max !== null && filterValue.max !== '') {
          rangeFilter.$lte = Number(filterValue.max);
        }
        if (filterValue.from) {
          rangeFilter.$gte = new Date(filterValue.from);
        }
        if (filterValue.to) {
          const toDate = new Date(filterValue.to);
          toDate.setHours(23, 59, 59, 999);
          rangeFilter.$lte = toDate;
        }
        
        if (Object.keys(rangeFilter).length > 0) {
          filter[fieldName] = rangeFilter;
        }
      }
    }

    // Build sort object
    let sortObj = { createdAt: -1 }; // Default sort
    if (sort && sort.includes(':')) {
      const [field, direction] = sort.split(':');
      sortObj = { [field]: direction === 'desc' ? -1 : 1 };
    }

    // Execute query
    const [items, total] = await Promise.all([
      InstrumentHolding.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InstrumentHolding.countDocuments(filter)
    ]);

    res.json({
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum))
    });

  } catch (error) {
    console.error('Error fetching instruments:', error);
    res.status(500).json({ error: 'Failed to fetch instruments' });
  }
});

module.exports = router;
