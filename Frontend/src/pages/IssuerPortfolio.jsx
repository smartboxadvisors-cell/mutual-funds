import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import "./issuer-portfolio.css";

const RAW_API_BASE = import.meta.env?.VITE_API_URL || "http://localhost:5000/api";
const API_BASE = RAW_API_BASE.replace(/\/$/, "");

const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};

const FETCH_LIMIT = 100; // Reduced from 500 for faster initial load
const SCHEMES_PER_PAGE = 100;
const SCHEME_CHART_SAMPLE = 12;
const MAX_PAGES_TO_FETCH = 20; // Limit total pages for performance
const MAX_PAGES_WITH_SEARCH = 50; // Allow more pages when user is searching

const COLORS = [
  "#4c51bf",
  "#2b6cb0",
  "#2c7a7b",
  "#38a169",
  "#d69e2e",
  "#dd6b20",
  "#c05621",
  "#9f7aea",
  "#805ad5",
  "#dd6b20",
];

const SECONDARY_COLORS = [
  "#60a5fa",
  "#f97316",
  "#34d399",
  "#fbbf24",
  "#a855f7",
  "#f87171",
  "#0ea5e9",
  "#facc15",
  "#22d3ee",
  "#f472b6",
];

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  compactDisplay: "short",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const percentageFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value) => currencyFormatter.format(value ?? 0);
const formatCompactCurrency = (value) => compactCurrencyFormatter.format(value ?? 0);
const formatQuantity = (value) => {
  if (value === null || value === undefined) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-IN");
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.+-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function IssuerPortfolio() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [schemeQuery, setSchemeQuery] = useState("");
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [schemePage, setSchemePage] = useState(1);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchHoldings = async () => {
      try {
        setLoading(true);
        setLoadingProgress(0);
        setError(null);

        const token = localStorage.getItem("token");
        const allHoldings = [];
        let page = 1;
        let totalPages = 1;

        // Use higher limit when searching for specific data
        const maxPages = search.trim() ? MAX_PAGES_WITH_SEARCH : MAX_PAGES_TO_FETCH;
        
        // Detect if search looks like an ISIN (12 alphanumeric characters)
        const searchTerm = search.trim();
        const isISINSearch = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(searchTerm);

        // Limit the number of pages to fetch for performance
        while (page <= totalPages && page <= maxPages) {
          const params = new URLSearchParams({
            page: String(page),
            limit: String(FETCH_LIMIT),
            hideIncomplete: "0",
          });
          
          // Add server-side filtering for ISIN searches
          if (isISINSearch) {
            params.set('isin', searchTerm);
          } else if (searchTerm) {
            params.set('search', searchTerm);
          }

          let urlString = buildApiUrl("/imports");
          try {
            const url = new URL(urlString);
            params.forEach((value, key) => url.searchParams.set(key, value));
            urlString = url.toString();
          } catch {
            const connector = urlString.includes("?") ? "&" : "?";
            urlString = `${urlString}${connector}${params.toString()}`;
          }

          const response = await fetch(urlString, {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });

          if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.replace("/login");
            return;
          }

          if (!response.ok) {
            const message = await response.text();
            throw new Error(message || `Failed to fetch holdings (${response.status})`);
          }

          const payload = await response.json();
          const items = Array.isArray(payload.items) ? payload.items : [];
          allHoldings.push(...items);

          const maxPages = search.trim() ? MAX_PAGES_WITH_SEARCH : MAX_PAGES_TO_FETCH;
          totalPages = Math.min(payload.totalPages || 1, maxPages);
          
          // Update progress
          const progress = Math.round((page / totalPages) * 100);
          setLoadingProgress(progress);
          
          page += 1;
        }

        if (!active) return;
        setHoldings(allHoldings);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Mutual fund holdings fetch error:", err);
        if (active) {
          setError(err.message || "Unable to load mutual fund holdings");
          setHoldings([]);
        }
      } finally {
        if (active) {
          setLoading(false);
          setLoadingProgress(100);
        }
      }
    };

    fetchHoldings();
    return () => {
      active = false;
      controller.abort();
    };
  }, [search]); // Re-fetch when search changes to get all matching data

  useEffect(() => {
    setSchemePage(1);
  }, [schemeQuery]);

  const filteredHoldings = useMemo(() => {
    const term = search.trim().toLowerCase();
    // Check if it's an ISIN search (already filtered server-side)
    const isISINSearch = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(term);
    
    // If empty search or ISIN search (already filtered server-side), return all holdings
    if (!term || isISINSearch) return holdings;
    
    // Otherwise, apply client-side filtering for other searches
    return holdings.filter((item) => {
      const scheme = String(item.scheme_name || "").toLowerCase();
      const instrument = String(item.instrument_name || "").toLowerCase();
      const isin = String(item.isin || "").toLowerCase();
      const rating = String(item.rating || "").toLowerCase();
      const issuer = String(item.issuer || "").toLowerCase();
      return (
        scheme.includes(term) ||
        instrument.includes(term) ||
        isin.includes(term) ||
        rating.includes(term) ||
        issuer.includes(term)
      );
    });
  }, [holdings, search]);
  const schemeSummaries = useMemo(() => {
    if (!filteredHoldings.length) return [];

    const bucket = new Map();

    filteredHoldings.forEach((item) => {
      const schemeName = String(item.scheme_name || "").trim() || "Unnamed Scheme";
      const mv = parseNumber(item.market_value);
      const quantity = parseNumber(item.quantity);
      const pctNav =
        parseNumber(item.pct_to_nav) ||
        parseNumber(item.pct_to_NAV) ||
        parseNumber(item.navPercent);

      if (!bucket.has(schemeName)) {
        bucket.set(schemeName, {
          scheme: schemeName,
          holdings: [],
          totalMarketValue: 0,
          totalQuantity: 0,
          pctNavSum: 0,
          pctNavCount: 0,
        });
      }

      const entry = bucket.get(schemeName);
      entry.holdings.push(item);
      entry.totalMarketValue += mv;
      entry.totalQuantity += quantity;
      if (pctNav) {
        entry.pctNavSum += pctNav;
        entry.pctNavCount += 1;
      }
    });

    return Array.from(bucket.values())
      .map((entry) => ({
        scheme: entry.scheme,
        holdings: entry.holdings,
        totalMarketValue: entry.totalMarketValue,
        totalQuantity: entry.totalQuantity,
        averagePctNav: entry.pctNavCount ? entry.pctNavSum / entry.pctNavCount : null,
        holdingsCount: entry.holdings.length,
      }))
      .sort((a, b) => b.totalMarketValue - a.totalMarketValue);
  }, [filteredHoldings]);

  const schemeMeta = useMemo(() => {
    if (!schemeSummaries.length) {
      return {
        totalSchemes: 0,
        totalMarketValue: 0,
        totalQuantity: 0,
        holdingsCount: filteredHoldings.length,
        topScheme: null,
      };
    }

    const totalMarketValue = schemeSummaries.reduce(
      (acc, entry) => acc + entry.totalMarketValue,
      0
    );
    const totalQuantity = schemeSummaries.reduce(
      (acc, entry) => acc + entry.totalQuantity,
      0
    );

    return {
      totalSchemes: schemeSummaries.length,
      totalMarketValue,
      totalQuantity,
      holdingsCount: filteredHoldings.length,
      topScheme: schemeSummaries[0] || null,
    };
  }, [schemeSummaries, filteredHoldings.length]);

  const schemeExposureData = useMemo(
    () =>
      schemeSummaries.slice(0, SCHEME_CHART_SAMPLE).map((entry, index) => ({
        scheme: entry.scheme,
        marketValue: Number(entry.totalMarketValue.toFixed(2)),
        color: COLORS[index % COLORS.length],
      })),
    [schemeSummaries]
  );

  const schemeList = useMemo(() => {
    const term = schemeQuery.trim().toLowerCase();
    if (!term) return schemeSummaries;
    return schemeSummaries.filter((entry) => entry.scheme.toLowerCase().includes(term));
  }, [schemeQuery, schemeSummaries]);

  useEffect(() => {
    if (!schemeList.length) {
      setSelectedScheme(null);
      return;
    }

    setSelectedScheme((prev) => {
      if (prev && schemeList.some((entry) => entry.scheme === prev)) {
        return prev;
      }
      return schemeList[0].scheme;
    });
  }, [schemeList]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(schemeList.length / SCHEMES_PER_PAGE));
    setSchemePage((prev) => Math.min(prev, totalPages));
  }, [schemeList]);

  const totalSchemePages = useMemo(
    () => Math.max(1, Math.ceil(schemeList.length / SCHEMES_PER_PAGE)),
    [schemeList]
  );

  const paginatedSchemes = useMemo(() => {
    const start = (schemePage - 1) * SCHEMES_PER_PAGE;
    return schemeList.slice(start, start + SCHEMES_PER_PAGE);
  }, [schemeList, schemePage]);

  const schemeTotal = schemeList.length;
  const schemeStart = schemeTotal ? (schemePage - 1) * SCHEMES_PER_PAGE + 1 : 0;
  const schemeEnd = schemeTotal ? Math.min(schemePage * SCHEMES_PER_PAGE, schemeTotal) : 0;

  const activeScheme = useMemo(() => {
    if (!selectedScheme) return null;
    const entry = schemeSummaries.find((scheme) => scheme.scheme === selectedScheme);
    if (!entry) return null;

    const totalValue = entry.totalMarketValue || 0;
    const instrumentMap = new Map();
    const ratingMap = new Map();
    const issuerMap = new Map();

    entry.holdings.forEach((holding) => {
      const value = parseNumber(holding.market_value);
      const instrument = holding.instrumentType || "Unclassified";
      const rating = holding.rating || "Unrated";
      const issuer = holding.issuer || "Unattributed Issuer";

      instrumentMap.set(instrument, (instrumentMap.get(instrument) || 0) + value);
      ratingMap.set(rating, (ratingMap.get(rating) || 0) + 1);
      issuerMap.set(issuer, (issuerMap.get(issuer) || 0) + value);
    });

    const instrumentMix = Array.from(instrumentMap.entries())
      .map(([name, value], index) => ({
        name,
        value: Number(value.toFixed(2)),
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);

    const ratingBreakdown = Array.from(ratingMap.entries())
      .map(([rating, count], index) => ({
        rating,
        count,
        color: SECONDARY_COLORS[index % SECONDARY_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const issuerBreakdown = Array.from(issuerMap.entries())
      .map(([issuer, value]) => ({
        issuer,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);

    const holdingsSorted = [...entry.holdings].sort(
      (a, b) => parseNumber(b.market_value) - parseNumber(a.market_value)
    );

    return {
      ...entry,
      uniqueIssuers: issuerMap.size,
      instrumentMix,
      ratingBreakdown,
      issuerBreakdown,
      holdingsSorted,
    };
  }, [selectedScheme, schemeSummaries]);
  return (
    <div className="issuer-page">
      <div className="issuer-shell">
        <header className="issuer-card issuer-card--glass issuer-hero">
          <div className="issuer-hero__layout">
            <div className="issuer-hero__intro">
              <span className="issuer-tag">Mutual Funds</span>
              <h1 className="issuer-title">Scheme Exposure Dashboard</h1>
              <p className="issuer-subtitle">
                Consolidated look at holdings grouped by scheme name. Filter by scheme, instrument,
                ISIN, rating, or issuer to analyse market value concentration and quantity exposure.
              </p>
            </div>
            <div className="issuer-hero__controls">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search scheme, instrument, ISIN, rating, or issuer"
                className="issuer-input"
              />
              <span className="issuer-chip">
                {filteredHoldings.length} holdings
                {search.trim() && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(search.trim()) && 
                  ` • ISIN Search: ${schemeMeta.totalSchemes} schemes`}
              </span>
            </div>
          </div>

          <ul className="issuer-stats">
            <li className="issuer-stat">
              <p className="issuer-stat__label">Unique Schemes</p>
              <p className="issuer-stat__value">
                {schemeMeta.totalSchemes.toLocaleString("en-IN")}
              </p>
              <span className="issuer-stat__hint">Represented in the current selection</span>
            </li>
            <li className="issuer-stat">
              <p className="issuer-stat__label">Holdings in Scope</p>
              <p className="issuer-stat__value">
                {schemeMeta.holdingsCount.toLocaleString("en-IN")}
              </p>
              <span className="issuer-stat__hint">Rows contributing to scheme totals</span>
            </li>
            <li className="issuer-stat">
              <p className="issuer-stat__label">Market Value (Rs Lacs)</p>
              <p className="issuer-stat__value">{formatCurrency(schemeMeta.totalMarketValue)}</p>
              <span className="issuer-stat__hint">Aggregated across all schemes</span>
            </li>
            <li className="issuer-stat">
              <p className="issuer-stat__label">Aggregate Quantity</p>
              <p className="issuer-stat__value">{formatQuantity(schemeMeta.totalQuantity)}</p>
              <span className="issuer-stat__hint">Summed across holdings</span>
            </li>
            <li className="issuer-stat">
              <p className="issuer-stat__label">Top Scheme Exposure</p>
              <p className="issuer-stat__value">
                {schemeMeta.topScheme ? schemeMeta.topScheme.scheme : "Awaiting data"}
              </p>
              <span className="issuer-stat__hint">
                {schemeMeta.topScheme
                  ? formatCurrency(schemeMeta.topScheme.totalMarketValue)
                  : "No scheme data available"}
              </span>
            </li>
          </ul>
        </header>

        {loading ? (
          <div className="issuer-card issuer-card--message">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
                Loading scheme dashboard...
              </div>
              <div style={{ 
                width: '100%', 
                height: '8px', 
                backgroundColor: '#e2e8f0', 
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '0.5rem'
              }}>
                <div style={{ 
                  width: `${loadingProgress}%`, 
                  height: '100%', 
                  backgroundColor: '#4c51bf',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#718096' }}>
                {loadingProgress}% complete
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="issuer-card issuer-card--message issuer-card--error">{error}</div>
        ) : schemeSummaries.length === 0 ? (
          <div className="issuer-card issuer-card--message">
            No schemes match the current search.
          </div>
        ) : (
          <>
            <section className="issuer-card">
              <div className="issuer-card__header">
                <div>
                  <h2>Scheme Exposure Overview</h2>
                  <p>
                    Largest schemes ranked by market value. Click a bar to focus the detail panel.
                  </p>
                </div>
                <span className="issuer-chip issuer-chip--light">
                  Top {schemeExposureData.length.toLocaleString("en-IN")} schemes
                </span>
              </div>
              <div className="issuer-chart issuer-chart--bar">
                {schemeExposureData.length === 0 ? (
                  <div className="issuer-chart__empty">Not enough data to render chart.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={schemeExposureData}
                      margin={{ top: 12, right: 24, left: 12, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="scheme"
                        angle={-20}
                        textAnchor="end"
                        height={70}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <RechartsTooltip
                        formatter={(value, _label, payload) => [
                          formatCurrency(value),
                          payload?.payload?.scheme,
                        ]}
                      />
                      <Bar dataKey="marketValue" radius={[10, 10, 0, 0]}>
                        {schemeExposureData.map((entry) => (
                          <Cell
                            key={entry.scheme}
                            fill={entry.color}
                            style={{ cursor: "pointer" }}
                            onClick={() => setSelectedScheme(entry.scheme)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <div className="issuer-grid">
              <section className="issuer-card issuer-card--sidebar">
                <div className="issuer-card__header issuer-card__header--stacked">
                  <div>
                    <h2>Scheme Directory</h2>
                    <p>Select a scheme to inspect holdings and issuer concentration.</p>
                  </div>
                  <input
                    value={schemeQuery}
                    onChange={(event) => setSchemeQuery(event.target.value)}
                    placeholder="Filter scheme name"
                    className="issuer-input issuer-input--subtle"
                  />
                </div>

                <div className="issuer-leaderboard">
                  {paginatedSchemes.length === 0 ? (
                    <div className="issuer-leaderboard__empty">No scheme matches the filter.</div>
                  ) : (
                    paginatedSchemes.map((entry) => {
                      const share =
                        schemeMeta.totalMarketValue > 0
                          ? (entry.totalMarketValue / schemeMeta.totalMarketValue) * 100
                          : 0;
                      const isActive = entry.scheme === selectedScheme;
                      const avgPctNavText =
                        entry.averagePctNav !== null
                          ? `${percentageFormatter.format(entry.averagePctNav)}%`
                          : "NA";
                      const shareText =
                        schemeMeta.totalMarketValue > 0
                          ? `${percentageFormatter.format(share)}% of MV`
                          : "�";

                      return (
                        <button
                          key={entry.scheme}
                          type="button"
                          onClick={() => setSelectedScheme(entry.scheme)}
                          className={`issuer-leaderboard__item${
                            isActive ? " issuer-leaderboard__item--active" : ""
                          }`}
                        >
                          <div className="issuer-leaderboard__heading">
                            <span className="issuer-leaderboard__name">{entry.scheme}</span>
                            <span className="issuer-leaderboard__value">
                              {formatCurrency(entry.totalMarketValue)}
                            </span>
                          </div>
                          <div className="issuer-leaderboard__meta">
                            <span>
                              {entry.holdingsCount.toLocaleString("en-IN")} holdings � {avgPctNavText}
                            </span>
                            <span>{shareText}</span>
                          </div>
                          <div className="issuer-leaderboard__meta">
                            <span>Total Quantity</span>
                            <span>{formatQuantity(entry.totalQuantity)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {schemeList.length > SCHEMES_PER_PAGE ? (
                  <div className="issuer-pagination">
                    <span className="issuer-pagination__info">
                      Showing {schemeStart}-{schemeEnd} of {schemeList.length} schemes (Page {schemePage} of {totalSchemePages})
                    </span>
                    <div className="issuer-pagination__controls">
                      <button
                        type="button"
                        onClick={() => setSchemePage((prev) => Math.max(1, prev - 1))}
                        disabled={schemePage === 1}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchemePage((prev) => Math.min(totalSchemePages, prev + 1))}
                        disabled={schemePage === totalSchemePages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="issuer-card issuer-card--detail">
                {activeScheme ? (
                  <>
                    <div className="issuer-card__header">
                      <div>
                        <span className="issuer-tag issuer-tag--accent">Selected Scheme</span>
                        <h2>{activeScheme.scheme}</h2>
                        <p>
                          Consolidated exposure overview for the selected scheme, including issuer
                          mix, ratings, and holdings breakdown.
                        </p>
                      </div>
                    </div>

                    <div className="issuer-detail-metrics">
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Market Value (Rs Lacs)</p>
                        <p className="issuer-detail-metric__value">
                          {formatCurrency(activeScheme.totalMarketValue)}
                        </p>
                        <span className="issuer-detail-metric__hint">
                          Aggregated across scheme holdings
                        </span>
                      </div>
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Holdings Count</p>
                        <p className="issuer-detail-metric__value">
                          {activeScheme.holdingsCount.toLocaleString("en-IN")}
                        </p>
                        <span className="issuer-detail-metric__hint">
                          Rows contributing to this scheme
                        </span>
                      </div>
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Unique Issuers</p>
                        <p className="issuer-detail-metric__value">
                          {activeScheme.uniqueIssuers.toLocaleString("en-IN")}
                        </p>
                        <span className="issuer-detail-metric__hint">
                          Issuers present within the scheme
                        </span>
                      </div>
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Total Quantity</p>
                        <p className="issuer-detail-metric__value">
                          {formatQuantity(activeScheme.totalQuantity)}
                        </p>
                        <span className="issuer-detail-metric__hint">
                          Sum of reported quantities
                        </span>
                      </div>
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Average % to NAV</p>
                        <p className="issuer-detail-metric__value">
                          {activeScheme.averagePctNav !== null
                            ? `${percentageFormatter.format(activeScheme.averagePctNav)}%`
                            : "NA"}
                        </p>
                        <span className="issuer-detail-metric__hint">
                          Across holdings with NAV data
                        </span>
                      </div>
                    </div>

                    <div className="issuer-mini-grid">
                      <div className="issuer-mini-card">
                        <div className="issuer-mini-card__header">
                          <h3>Instrument Mix</h3>
                          <p>Share of market value by instrument classification.</p>
                        </div>
                        <div className="issuer-chart">
                          {activeScheme.instrumentMix.length === 0 ? (
                            <div className="issuer-chart__empty">
                              Not enough data to render chart.
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={activeScheme.instrumentMix}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius="45%"
                                  outerRadius="68%"
                                  paddingAngle={1.6}
                                >
                                  {activeScheme.instrumentMix.map((segment) => (
                                    <Cell key={segment.name} fill={segment.color} />
                                  ))}
                                </Pie>
                                <RechartsTooltip
                                  formatter={(value, _label, payload) => [
                                    formatCurrency(value),
                                    payload?.payload?.name,
                                  ]}
                                />
                                <Legend verticalAlign="bottom" height={32} />
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      <div className="issuer-mini-card">
                        <div className="issuer-mini-card__header">
                          <h3>Rating Distribution</h3>
                          <p>Count of holdings by credit rating (top 12 buckets).</p>
                        </div>
                        <div className="issuer-chart">
                          {activeScheme.ratingBreakdown.length === 0 ? (
                            <div className="issuer-chart__empty">
                              Ratings were unavailable for this scheme.
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={activeScheme.ratingBreakdown}
                                margin={{ top: 12, right: 24, left: 12, bottom: 24 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                  dataKey="rating"
                                  angle={-25}
                                  textAnchor="end"
                                  height={60}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                                <RechartsTooltip />
                                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                  {activeScheme.ratingBreakdown.map((entry) => (
                                    <Cell key={entry.rating} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="issuer-card__section">
                      <div className="issuer-card__header issuer-card__header--compact">
                        <h3>Issuer Exposures</h3>
                        <p>Top issuers ranked by market value within this scheme.</p>
                      </div>
                      <div className="issuer-scheme-list">
                        {activeScheme.issuerBreakdown.length === 0 ? (
                          <div className="issuer-scheme-list__empty">
                            No issuer level data available.
                          </div>
                        ) : (
                          activeScheme.issuerBreakdown.map((issuer) => (
                            <div key={issuer.issuer} className="issuer-scheme">
                              <div className="issuer-scheme__header">
                                <span className="issuer-scheme__name">{issuer.issuer}</span>
                                <span className="issuer-scheme__value">
                                  {formatCurrency(issuer.value)}
                                </span>
                              </div>
                              <div className="issuer-progress">
                                <div
                                  className="issuer-progress__fill"
                                  style={{
                                    width: `${Math.min(100, Math.max(2, issuer.percentage))}%`,
                                  }}
                                />
                              </div>
                              <span className="issuer-scheme__hint">
                                {percentageFormatter.format(issuer.percentage)}% of scheme exposure
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="issuer-card__section">
                      <div className="issuer-card__header issuer-card__header--compact">
                        <h3>Holdings Breakdown</h3>
                        <p>All holdings ordered by market value within the selected scheme.</p>
                      </div>
                      <div className="issuer-table__wrapper">
                        <table className="issuer-table">
                          <thead>
                            <tr>
                              <th>Scheme</th>
                              <th>Instrument</th>
                              <th>ISIN</th>
                              <th>Rating</th>
                              <th>Instrument Type</th>
                              <th className="align-right">Market Value (Rs Lacs)</th>
                              <th className="align-right">% to NAV</th>
                              <th className="align-right">Quantity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeScheme.holdingsSorted.map((holding) => {
                              const pctToNav =
                                parseNumber(holding.pct_to_nav) ||
                                parseNumber(holding.pct_to_NAV) ||
                                parseNumber(holding.navPercent);

                              return (
                                <tr
                                  key={`${holding.scheme_name}-${holding.instrument_name}-${holding.isin}`}
                                >
                                  <td className="issuer-table__cell--strong">
                                    {holding.scheme_name || "N/A"}
                                  </td>
                                  <td>
                                    <span className="issuer-table__cell--strong">
                                      {holding.instrument_name || "N/A"}
                                    </span>
                                    {holding.sector ? (
                                      <span className="issuer-badge">{holding.sector}</span>
                                    ) : null}
                                  </td>
                                  <td className="issuer-table__cell--mono">
                                    {holding.isin || "N/A"}
                                  </td>
                                  <td>{holding.rating || "Unrated"}</td>
                                  <td>{holding.instrumentType || "Unclassified"}</td>
                                  <td className="align-right issuer-table__cell--strong">
                                    {formatCurrency(parseNumber(holding.market_value))}
                                  </td>
                                  <td className="align-right">
                                    {pctToNav ? `${percentageFormatter.format(pctToNav)}%` : "N/A"}
                                  </td>
                                  <td className="align-right">
                                    {formatQuantity(parseNumber(holding.quantity))}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="issuer-placeholder">
                    Select a scheme to view detailed analytics.
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
