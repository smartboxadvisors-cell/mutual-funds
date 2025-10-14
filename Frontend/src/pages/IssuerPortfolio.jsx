import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  BarChart,
  Bar,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';

const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:5000/api';

const COLORS = [
  '#4338ca',
  '#2563eb',
  '#0891b2',
  '#0f766e',
  '#ca8a04',
  '#c2410c',
  '#dc2626',
  '#9333ea',
  '#15803d',
  '#7c3aed',
];

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value) => currencyFormatter.format(value ?? 0);

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^0-9.+-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function IssuerPortfolio() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchPortfolio = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: '1',
          limit: '5000',
          sort: 'tradeDate',
          order: 'desc',
        });

        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/trading/transactions?${params.toString()}`, {
          signal: controller.signal,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Server error: ${response.status}`);
        }

        const payload = await response.json();
        if (!isMounted) return;
        setRows(payload.data || []);
        setError(null);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Issuer portfolio fetch error:', err);
        if (isMounted) {
          setError(err.message || 'Failed to load issuer portfolio');
          setRows([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPortfolio();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const grouped = useMemo(() => {
    if (!rows.length) return [];
    const map = new Map();

    rows.forEach((row) => {
      const key = `${row.isin || ''}|${row.issuerName || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          isin: row.isin || '-',
          issuer: row.issuerName || '-',
          exchanges: new Set(),
          orderTypes: new Set(),
          tradeCount: 0,
          totalAmount: 0,
          yieldSum: 0,
          yieldCount: 0,
          firstTradeDate: null,
          lastTradeDate: null,
          earliestMaturity: null,
          latestMaturity: null,
        });
      }

      const entry = map.get(key);
      entry.tradeCount += 1;
      if (row.exchange) entry.exchanges.add(row.exchange);
      if (row.orderType) entry.orderTypes.add(row.orderType);

      const amount = parseNumber(row.tradeAmountValue ?? row.tradeAmountRaw);
      if (amount) entry.totalAmount += amount;

      const yieldValue = parseNumber(row.yieldValue ?? row.yieldRaw);
      if (yieldValue) {
        entry.yieldSum += yieldValue;
        entry.yieldCount += 1;
      }

      if (row.tradeDate) {
        const tradeDate = new Date(row.tradeDate);
        if (!Number.isNaN(tradeDate.getTime())) {
          if (!entry.firstTradeDate || tradeDate < entry.firstTradeDate) {
            entry.firstTradeDate = tradeDate;
          }
          if (!entry.lastTradeDate || tradeDate > entry.lastTradeDate) {
            entry.lastTradeDate = tradeDate;
          }
        }
      }

      if (row.maturityDate) {
        const maturity = new Date(row.maturityDate);
        if (!Number.isNaN(maturity.getTime())) {
          if (!entry.earliestMaturity || maturity < entry.earliestMaturity) {
            entry.earliestMaturity = maturity;
          }
          if (!entry.latestMaturity || maturity > entry.latestMaturity) {
            entry.latestMaturity = maturity;
          }
        }
      }
    });

    return Array.from(map.values()).map((entry) => ({
      ...entry,
      exchanges: Array.from(entry.exchanges).join(', ') || '-',
      orderTypes: Array.from(entry.orderTypes).join(', ') || '-',
      avgYield: entry.yieldCount > 0 ? Number(entry.yieldSum / entry.yieldCount) : null,
      firstTradeDate: entry.firstTradeDate ? entry.firstTradeDate.toISOString() : null,
      lastTradeDate: entry.lastTradeDate ? entry.lastTradeDate.toISOString() : null,
      earliestMaturity: entry.earliestMaturity ? entry.earliestMaturity.toISOString() : null,
      latestMaturity: entry.latestMaturity ? entry.latestMaturity.toISOString() : null,
    }));
  }, [rows]);

  const summary = useMemo(() => {
    if (!grouped.length) {
      return {
        issuerCount: 0,
        tradeCount: rows.length,
        totalAmount: 0,
        averageYield: null,
      };
    }

    const totals = grouped.reduce(
      (acc, entry) => {
        acc.totalAmount += entry.totalAmount;
        acc.tradeCount += entry.tradeCount;
        if (entry.avgYield !== null) {
          acc.yieldSum += entry.avgYield;
          acc.yieldBuckets += 1;
        }
        return acc;
      },
      { totalAmount: 0, tradeCount: 0, yieldSum: 0, yieldBuckets: 0 }
    );

    return {
      issuerCount: grouped.length,
      tradeCount: totals.tradeCount,
      totalAmount: totals.totalAmount,
      averageYield:
        totals.yieldBuckets > 0 ? Number(totals.yieldSum / totals.yieldBuckets) : null,
    };
  }, [grouped, rows.length]);

  const topIssuers = useMemo(() => {
    if (!grouped.length) return [];
    return [...grouped]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 8)
      .map((entry, index) => ({
        name: entry.issuer.length > 28 ? `${entry.issuer.slice(0, 25)}…` : entry.issuer,
        value: Number(entry.totalAmount.toFixed(2)),
        fullIssuer: entry.issuer,
        isin: entry.isin,
        color: COLORS[index % COLORS.length],
      }));
  }, [grouped]);

  const topIssuersByTrades = useMemo(() => {
    if (!grouped.length) return [];
    return [...grouped]
      .sort((a, b) => b.tradeCount - a.tradeCount)
      .slice(0, 8)
      .map((entry, index) => ({
        name: entry.issuer.length > 24 ? `${entry.issuer.slice(0, 21)}…` : entry.issuer,
        tradeCount: entry.tradeCount,
        fullIssuer: entry.issuer,
        isin: entry.isin,
        color: COLORS[(index + 3) % COLORS.length],
      }));
  }, [grouped]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return grouped;
    return grouped.filter((entry) =>
      entry.isin.toLowerCase().includes(term) || entry.issuer.toLowerCase().includes(term)
    );
  }, [grouped, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-6 rounded-3xl bg-white/10 p-8 shadow-xl ring-1 ring-white/10 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-200">Analytics</p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                Issuer Portfolio Intelligence
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-200">
                Consolidated view of traded securities, amounts, and yields grouped by issuer. Use the
                search to focus on a specific counterparty.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by issuer or ISIN"
                className="w-full rounded-lg border border-indigo-400/60 bg-white/90 px-4 py-2 text-sm text-slate-700 shadow focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 sm:w-72"
              />
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-100">
                {filtered.length} issuers
              </span>
            </div>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-indigo-500/20 px-5 py-4 ring-1 ring-indigo-400/40">
              <dt className="text-xs uppercase tracking-wide text-indigo-200">Issuers</dt>
              <dd className="mt-1 text-2xl font-semibold text-white">{summary.issuerCount.toLocaleString()}</dd>
              <p className="text-xs text-indigo-100/80">Active across current selection</p>
            </div>
            <div className="rounded-2xl bg-sky-500/20 px-5 py-4 ring-1 ring-sky-400/40">
              <dt className="text-xs uppercase tracking-wide text-sky-200">Total Trades</dt>
              <dd className="mt-1 text-2xl font-semibold text-white">{summary.tradeCount.toLocaleString()}</dd>
              <p className="text-xs text-sky-100/80">Across fetched transactions</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/20 px-5 py-4 ring-1 ring-emerald-400/40">
              <dt className="text-xs uppercase tracking-wide text-emerald-200">Amount (Rs Lacs)</dt>
              <dd className="mt-1 text-2xl font-semibold text-white">
                {summary.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </dd>
              <p className="text-xs text-emerald-100/80">Cumulative deal value</p>
            </div>
            <div className="rounded-2xl bg-amber-500/20 px-5 py-4 ring-1 ring-amber-400/40">
              <dt className="text-xs uppercase tracking-wide text-amber-200">Average Yield</dt>
              <dd className="mt-1 text-2xl font-semibold text-white">
                {Number.isFinite(summary.averageYield) ? `${summary.averageYield.toFixed(2)}%` : '–'}
              </dd>
              <p className="text-xs text-amber-100/80">Across issuers with yield data</p>
            </div>
          </dl>
        </header>

        {loading ? (
          <div className="rounded-3xl bg-white/10 px-6 py-16 text-center text-sm text-slate-200 shadow-xl ring-1 ring-white/10 backdrop-blur">
            Loading issuer portfolio…
          </div>
        ) : error ? (
          <div className="rounded-3xl bg-rose-500/10 px-6 py-16 text-center text-sm text-rose-100 shadow-xl ring-1 ring-rose-400/40 backdrop-blur">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-white/10 px-6 py-16 text-center text-sm text-slate-200 shadow-xl ring-1 ring-white/10 backdrop-blur">
            No issuers match the current search.
          </div>
        ) : (
          <div className="space-y-8">
            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
              <div className="overflow-hidden rounded-3xl bg-white/90 shadow-xl ring-1 ring-slate-200/60">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Issuer</th>
                        <th className="px-4 py-3 text-left">ISIN</th>
                        <th className="px-4 py-3 text-left">Exchanges</th>
                        <th className="px-4 py-3 text-left">Deal Types</th>
                        <th className="px-4 py-3 text-right">Trades</th>
                        <th className="px-4 py-3 text-right">Amount (Rs Lacs)</th>
                        <th className="px-4 py-3 text-right">Avg Yield</th>
                        <th className="px-4 py-3 text-left">First Trade</th>
                        <th className="px-4 py-3 text-left">Last Trade</th>
                        <th className="px-4 py-3 text-left">Earliest Maturity</th>
                        <th className="px-4 py-3 text-left">Latest Maturity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {filtered.map((entry) => (
                        <tr key={`${entry.isin}|${entry.issuer}`} className="hover:bg-indigo-50/40">
                          <td className="px-4 py-3 font-semibold text-slate-800">{entry.issuer}</td>
                          <td className="px-4 py-3 font-mono text-xs uppercase text-slate-500">{entry.isin}</td>
                          <td className="px-4 py-3">{entry.exchanges}</td>
                          <td className="px-4 py-3">{entry.orderTypes}</td>
                          <td className="px-4 py-3 text-right font-semibold">{entry.tradeCount}</td>
                          <td className="px-4 py-3 text-right text-indigo-600">
                            {formatCurrency(entry.totalAmount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {Number.isFinite(entry.avgYield) ? `${entry.avgYield.toFixed(2)}%` : '–'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(entry.firstTradeDate)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(entry.lastTradeDate)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(entry.earliestMaturity)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(entry.latestMaturity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-slate-200/60">
                  <h2 className="text-lg font-semibold text-slate-900">Top Issuers by Amount</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Distribution of cumulative traded amount (Rs Lacs) for the leading counterparties.
                  </p>
                  <div className="mt-6 h-72">
                    {topIssuers.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        Not enough data to render chart.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={topIssuers}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="45%"
                            outerRadius="70%"
                            paddingAngle={2}
                          >
                            {topIssuers.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value, _, payload) => [value.toLocaleString('en-IN', { maximumFractionDigits: 2 }), payload?.payload?.fullIssuer]}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value, entry) => {
                              const payload = entry?.payload;
                              return payload?.fullIssuer || value;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-slate-200/60">
                  <h2 className="text-lg font-semibold text-slate-900">Most Active Issuers</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Issuers ranked by total trade count to highlight the busiest relationships.
                  </p>
                  <div className="mt-6 h-72">
                    {topIssuersByTrades.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        Not enough data to render chart.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topIssuersByTrades}
                          layout="vertical"
                          margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" axisLine={false} tickLine={false} />
                          <YAxis
                            dataKey="name"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            width={150}
                          />
                          <RechartsTooltip
                            cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                            formatter={(value, _, payload) => [
                              value.toLocaleString(),
                              payload?.payload?.fullIssuer,
                            ]}
                          />
                          <Bar dataKey="tradeCount" radius={[6, 6, 6, 6]}>
                            {topIssuersByTrades.map((entry) => (
                              <Cell key={entry.fullIssuer} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-slate-200/60">
                  <h2 className="text-lg font-semibold text-slate-900">Quick Insights</h2>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    <li>
                      • <strong>{summary.tradeCount.toLocaleString()}</strong> trades captured across{' '}
                      <strong>{summary.issuerCount.toLocaleString()}</strong> unique issuers.
                    </li>
                    <li>
                      • Total traded amount stands at{' '}
                      <strong>{summary.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>{' '}
                      Rs Lacs.
                    </li>
                    <li>
                      • Average recorded yield:{' '}
                      <strong>
                        {Number.isFinite(summary.averageYield)
                          ? ` ${summary.averageYield.toFixed(2)}%`
                          : ' N/A'}
                      </strong>
                      .
                    </li>
                    <li>
                      • Top counterparties span {new Set(grouped.flatMap((entry) => entry.exchanges.split(', '))).size}{' '}
                      exchanges and {new Set(grouped.flatMap((entry) => entry.orderTypes.split(', '))).size} deal styles.
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}


