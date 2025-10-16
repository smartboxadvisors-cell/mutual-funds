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
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedIssuer, setSelectedIssuer] = useState(null);
  const [issuerQuery, setIssuerQuery] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchHoldings = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          page: "1",
          limit: "500",
          hideIncomplete: "0",
        });

        const token = localStorage.getItem("token");
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
        if (!active) return;

        const items = Array.isArray(payload.items) ? payload.items : [];
        setHoldings(items);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Mutual fund holdings fetch error:", err);
        if (active) {
          setError(err.message || "Unable to load mutual fund holdings");
          setHoldings([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchHoldings();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const filteredHoldings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return holdings;
    return holdings.filter((item) => {
      const instrument = String(item.instrument_name || "").toLowerCase();
      const scheme = String(item.scheme_name || "").toLowerCase();
      const isin = String(item.isin || "").toLowerCase();
      const rating = String(item.rating || "").toLowerCase();
      const issuer = String(item.issuer || "").toLowerCase();
      return (
        instrument.includes(term) ||
        scheme.includes(term) ||
        isin.includes(term) ||
        rating.includes(term) ||
        issuer.includes(term)
      );
    });
  }, [holdings, search]);

  const summary = useMemo(() => {
    if (!filteredHoldings.length) {
      return {
        holdingsCount: 0,
        schemesCount: 0,
        totalMarketValue: 0,
        avgPctNav: null,
      };
    }

    const totals = filteredHoldings.reduce(
      (acc, item) => {
        const mv = parseNumber(item.market_value);
        acc.marketValue += mv;

        const pctNav =
          parseNumber(item.pct_to_nav) ||
          parseNumber(item.pct_to_NAV) ||
          parseNumber(item.navPercent);
        if (pctNav) {
          acc.pctNavSum += pctNav;
          acc.pctNavCount += 1;
        }

        if (item.scheme_name) acc.schemes.add(item.scheme_name);
        return acc;
      },
      { marketValue: 0, pctNavSum: 0, pctNavCount: 0, schemes: new Set() }
    );

    return {
      holdingsCount: filteredHoldings.length,
      schemesCount: totals.schemes.size,
      totalMarketValue: totals.marketValue,
      avgPctNav: totals.pctNavCount > 0 ? totals.pctNavSum / totals.pctNavCount : null,
    };
  }, [filteredHoldings]);

  const issuerSummaries = useMemo(() => {
    if (!filteredHoldings.length) return [];

    const bucket = new Map();

    filteredHoldings.forEach((item) => {
      const issuerName = String(item.issuer || "").trim() || "Unattributed Issuer";
      const mv = parseNumber(item.market_value);
      const pctNav =
        parseNumber(item.pct_to_nav) ||
        parseNumber(item.pct_to_NAV) ||
        parseNumber(item.navPercent);

      if (!bucket.has(issuerName)) {
        bucket.set(issuerName, {
          issuer: issuerName,
          holdings: [],
          totalMarketValue: 0,
          pctNavSum: 0,
          pctNavCount: 0,
          schemes: new Set(),
        });
      }

      const entry = bucket.get(issuerName);
      entry.holdings.push(item);
      entry.totalMarketValue += mv;
      if (pctNav) {
        entry.pctNavSum += pctNav;
        entry.pctNavCount += 1;
      }
      if (item.scheme_name) {
        entry.schemes.add(item.scheme_name);
      }
    });

    return Array.from(bucket.values())
      .map((entry) => ({
        issuer: entry.issuer,
        holdings: entry.holdings,
        totalMarketValue: entry.totalMarketValue,
        holdingsCount: entry.holdings.length,
        averagePctNav: entry.pctNavCount > 0 ? entry.pctNavSum / entry.pctNavCount : null,
        schemeCount: entry.schemes.size,
      }))
      .sort((a, b) => b.totalMarketValue - a.totalMarketValue);
  }, [filteredHoldings]);

  const issuerMeta = useMemo(() => {
    if (!issuerSummaries.length) {
      return {
        totalIssuers: 0,
        totalMarketValue: 0,
        topIssuer: null,
      };
    }

    const totalMarketValue = issuerSummaries.reduce(
      (acc, entry) => acc + entry.totalMarketValue,
      0
    );

    return {
      totalIssuers: issuerSummaries.length,
      totalMarketValue,
      topIssuer: issuerSummaries[0] || null,
    };
  }, [issuerSummaries]);

  const issuerExposureData = useMemo(
    () =>
      issuerSummaries.slice(0, 12).map((entry, index) => ({
        issuer: entry.issuer,
        marketValue: Number(entry.totalMarketValue.toFixed(2)),
        color: COLORS[index % COLORS.length],
      })),
    [issuerSummaries]
  );

  const issuerList = useMemo(() => {
    const term = issuerQuery.trim().toLowerCase();
    if (!term) return issuerSummaries;
    return issuerSummaries.filter((entry) => entry.issuer.toLowerCase().includes(term));
  }, [issuerQuery, issuerSummaries]);

  useEffect(() => {
    if (!issuerSummaries.length) {
      setSelectedIssuer(null);
      return;
    }

    setSelectedIssuer((prev) => {
      if (prev && issuerSummaries.some((entry) => entry.issuer === prev)) {
        return prev;
      }
      return issuerSummaries[0].issuer;
    });
  }, [issuerSummaries]);

  const activeIssuer = useMemo(() => {
    if (!selectedIssuer) return null;
    const entry = issuerSummaries.find((issuer) => issuer.issuer === selectedIssuer);
    if (!entry) return null;

    const totalValue = entry.totalMarketValue || 0;

    const instrumentMap = new Map();
    const ratingMap = new Map();
    const schemeMap = new Map();

    entry.holdings.forEach((holding) => {
      const value = parseNumber(holding.market_value);
      const instrument = holding.instrumentType || "Unclassified";
      const rating = holding.rating || "Unrated";
      const scheme = holding.scheme_name || "Unnamed Scheme";

      instrumentMap.set(instrument, (instrumentMap.get(instrument) || 0) + value);
      ratingMap.set(rating, (ratingMap.get(rating) || 0) + 1);
      schemeMap.set(scheme, (schemeMap.get(scheme) || 0) + value);
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

    const schemeBreakdown = Array.from(schemeMap.entries())
      .map(([scheme, value]) => ({
        scheme,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const topHoldings = [...entry.holdings]
      .sort((a, b) => parseNumber(b.market_value) - parseNumber(a.market_value))
      .slice(0, 25);

    return {
      ...entry,
      instrumentMix,
      ratingBreakdown,
      schemeBreakdown,
      topHoldings,
    };
  }, [issuerSummaries, selectedIssuer]);

  return (
    <div className="issuer-page">
      <div className="issuer-shell">
        <header className="issuer-card issuer-card--glass issuer-hero">
          <div className="issuer-hero__layout">
            <div className="issuer-hero__intro">
              <span className="issuer-tag">Mutual Funds</span>
              <h1 className="issuer-title">Issuer Exposure Dashboard</h1>
              <p className="issuer-subtitle">
                Explore holdings grouped by issuer, understand concentration risks, and dig into
                scheme level contributions. Use the search box to refine the universe by scheme,
                instrument, ISIN, rating, or issuer name.
              </p>
            </div>
            <div className="issuer-hero__controls">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search issuer, scheme, instrument, ISIN, or rating"
                className="issuer-input"
              />
              <span className="issuer-chip">{filteredHoldings.length} holdings</span>
            </div>
          </div>

          <ul className="issuer-stats">
            <li className="issuer-stat">
              <p className="issuer-stat__label">Unique Issuers</p>
              <p className="issuer-stat__value">
                {issuerMeta.totalIssuers.toLocaleString("en-IN")}
              </p>
              <span className="issuer-stat__hint">In the current filtered view</span>
            </li>
            <li className="issuer-stat">
              <p className="issuer-stat__label">Holdings in Scope</p>
              <p className="issuer-stat__value">
                {summary.holdingsCount.toLocaleString("en-IN")}
              </p>
              <span className="issuer-stat__hint">Individual rows contributing to issuer totals</span>
            </li>
            <li className="issuer-stat">
              <p className="issuer-stat__label">Market Value (Rs Lacs)</p>
              <p className="issuer-stat__value">{formatCurrency(summary.totalMarketValue)}</p>
              <span className="issuer-stat__hint">Aggregated across the filtered holdings</span>
            </li>
            <li className="issuer-stat">
              <p className="issuer-stat__label">Top Issuer Exposure</p>
              <p className="issuer-stat__value">
                {issuerMeta.topIssuer ? issuerMeta.topIssuer.issuer : "Awaiting selection"}
              </p>
              <span className="issuer-stat__hint">
                {issuerMeta.topIssuer
                  ? formatCurrency(issuerMeta.topIssuer.totalMarketValue)
                  : "No issuer data available"}
              </span>
            </li>
          </ul>
        </header>

        {loading ? (
          <div className="issuer-card issuer-card--message">Loading issuer dashboard…</div>
        ) : error ? (
          <div className="issuer-card issuer-card--message issuer-card--error">{error}</div>
        ) : filteredHoldings.length === 0 ? (
          <div className="issuer-card issuer-card--message">
            No holdings match the current search.
          </div>
        ) : (
          <div className="issuer-content">
            <section className="issuer-card">
              <div className="issuer-card__header">
                <div>
                  <h2>Issuer Exposure Overview</h2>
                  <p>Largest issuers ranked by market value. Click a bar to focus the detail panel.</p>
                </div>
                <span className="issuer-chip issuer-chip--light">
                  Top {issuerExposureData.length.toLocaleString("en-IN")} issuers
                </span>
              </div>
              <div className="issuer-chart issuer-chart--bar">
                {issuerExposureData.length === 0 ? (
                  <div className="issuer-chart__empty">Not enough issuer data to render the chart.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={issuerExposureData}
                      margin={{ top: 12, right: 24, left: 0, bottom: 36 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="issuer"
                        angle={-20}
                        textAnchor="end"
                        height={60}
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
                          payload?.payload?.issuer,
                        ]}
                      />
                      <Bar dataKey="marketValue" radius={[10, 10, 0, 0]}>
                        {issuerExposureData.map((entry) => (
                          <Cell
                            key={entry.issuer}
                            fill={entry.color}
                            style={{ cursor: "pointer" }}
                            onClick={() => setSelectedIssuer(entry.issuer)}
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
                    <h2>Issuer Leaderboard</h2>
                    <p>Select an issuer to inspect concentration, schemes, and holdings.</p>
                  </div>
                  <input
                    value={issuerQuery}
                    onChange={(event) => setIssuerQuery(event.target.value)}
                    placeholder="Filter issuer name"
                    className="issuer-input issuer-input--subtle"
                  />
                </div>

                <div className="issuer-leaderboard">
                  {issuerList.length === 0 ? (
                    <div className="issuer-leaderboard__empty">No issuer matches the filter.</div>
                  ) : (
                    issuerList.map((entry) => {
                      const share =
                        issuerMeta.totalMarketValue > 0
                          ? (entry.totalMarketValue / issuerMeta.totalMarketValue) * 100
                          : 0;
                      const isActive = entry.issuer === selectedIssuer;

                      return (
                        <button
                          key={entry.issuer}
                          type="button"
                          onClick={() => setSelectedIssuer(entry.issuer)}
                          className={`issuer-leaderboard__item${
                            isActive ? " issuer-leaderboard__item--active" : ""
                          }`}
                        >
                          <div className="issuer-leaderboard__heading">
                            <span className="issuer-leaderboard__name">{entry.issuer}</span>
                            <span className="issuer-leaderboard__value">
                              {formatCurrency(entry.totalMarketValue)}
                            </span>
                          </div>
                          <div className="issuer-leaderboard__meta">
                            <span>
                              {entry.schemeCount.toLocaleString("en-IN")} schemes · {" "}
                              {entry.holdingsCount.toLocaleString("en-IN")} holdings
                            </span>
                            <span>{percentageFormatter.format(share)}% of filtered MV</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="issuer-card issuer-card--detail">
                {activeIssuer ? (
                  <>
                    <div className="issuer-card__header">
                      <div>
                        <span className="issuer-tag issuer-tag--accent">Selected Issuer</span>
                        <h2>{activeIssuer.issuer}</h2>
                        <p>Aggregate exposure across all holdings currently in scope.</p>
                      </div>
                    </div>

                    <div className="issuer-detail-metrics">
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Market Value (Rs Lacs)</p>
                        <p className="issuer-detail-metric__value">
                          {formatCurrency(activeIssuer.totalMarketValue)}
                        </p>
                        <span className="issuer-detail-metric__hint">
                          Across all holdings for this issuer
                        </span>
                      </div>
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Holdings Count</p>
                        <p className="issuer-detail-metric__value">
                          {activeIssuer.holdingsCount.toLocaleString("en-IN")}
                        </p>
                        <span className="issuer-detail-metric__hint">
                          Rows contributing to this issuer
                        </span>
                      </div>
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Unique Schemes</p>
                        <p className="issuer-detail-metric__value">
                          {activeIssuer.schemeCount.toLocaleString("en-IN")}
                        </p>
                        <span className="issuer-detail-metric__hint">Distinct scheme exposures</span>
                      </div>
                      <div className="issuer-detail-metric">
                        <p className="issuer-detail-metric__label">Average % to NAV</p>
                        <p className="issuer-detail-metric__value">
                          {activeIssuer.averagePctNav === null
                            ? "NA"
                            : `${percentageFormatter.format(activeIssuer.averagePctNav)}%`}
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
                          {activeIssuer.instrumentMix.length === 0 ? (
                            <div className="issuer-chart__empty">
                              Not enough data to render chart.
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={activeIssuer.instrumentMix}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius="45%"
                                  outerRadius="68%"
                                  paddingAngle={1.6}
                                >
                                  {activeIssuer.instrumentMix.map((segment) => (
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
                          {activeIssuer.ratingBreakdown.length === 0 ? (
                            <div className="issuer-chart__empty">
                              Ratings were unavailable for this issuer.
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={activeIssuer.ratingBreakdown}
                                margin={{ top: 12, right: 24, left: 0, bottom: 24 }}
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
                                  {activeIssuer.ratingBreakdown.map((entry) => (
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
                        <h3>Scheme Contributions</h3>
                        <p>Top schemes ranked by market value within this issuer.</p>
                      </div>
                      <div className="issuer-scheme-list">
                        {activeIssuer.schemeBreakdown.length === 0 ? (
                          <div className="issuer-scheme-list__empty">
                            No scheme level data available.
                          </div>
                        ) : (
                          activeIssuer.schemeBreakdown.map((scheme) => (
                            <div key={scheme.scheme} className="issuer-scheme">
                              <div className="issuer-scheme__header">
                                <span className="issuer-scheme__name">{scheme.scheme}</span>
                                <span className="issuer-scheme__value">
                                  {formatCurrency(scheme.value)}
                                </span>
                              </div>
                              <div className="issuer-progress">
                                <div
                                  className="issuer-progress__fill"
                                  style={{
                                    width: `${Math.min(100, Math.max(2, scheme.percentage))}%`,
                                  }}
                                />
                              </div>
                              <span className="issuer-scheme__hint">
                                {percentageFormatter.format(scheme.percentage)}% of issuer exposure
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="issuer-card__section">
                      <div className="issuer-card__header issuer-card__header--compact">
                        <h3>Holdings Breakdown</h3>
                        <p>Top 25 holdings by market value within the selected issuer.</p>
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
                            {activeIssuer.topHoldings.map((holding) => {
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
                                    {parseNumber(holding.quantity).toLocaleString("en-IN")}
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
                    Select an issuer to view detailed analytics.
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
