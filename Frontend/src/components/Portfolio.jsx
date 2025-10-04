import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

// simple demo data – replace with real fetch later if you want
const SAMPLE_HOLDINGS = {
  shivam: [
    { isin: 'INE857Q08032', name: 'Tata Capital 7.75% 2030', qty: 120, price: 101.2 },
    { isin: 'INE721A07RN7', name: 'Shriram Finance 8.75% 2026', qty: 80, price: 103.6 },
  ],
  bhumit: [
    { isin: 'INE134E07AP6', name: 'PFC FRN Jan 2031', qty: 150, price: 100.8 },
  ],
};

export default function Portfolio() {
  const { username } = useParams();

  const rows = useMemo(() => {
    const key = String(username || '').toLowerCase().trim();
    return SAMPLE_HOLDINGS[key] || [
      // default sample if user not found
      { isin: 'INE090W07667', name: 'Lendingkart 11.25% 2026', qty: 50, price: 99.5 },
      { isin: 'INE516Y07444', name: 'Piramal 6.75% 2031', qty: 35, price: 92.1 },
    ];
  }, [username]);

  const totalValue = rows.reduce((acc, r) => acc + r.qty * r.price, 0);

  return (
    <main style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 12 }}>Portfolio — {username}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>ISIN</th>
              <th style={th}>Security</th>
              <th style={th}>Qty</th>
              <th style={th}>Price</th>
              <th style={th}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.isin}>
                <td style={td}>{r.isin}</td>
                <td style={td}>{r.name}</td>
                <td style={tdRight}>{r.qty.toLocaleString()}</td>
                <td style={tdRight}>{r.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                <td style={tdRight}>{(r.qty * r.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} style={{ ...tdRight, fontWeight: 600 }}>Total</td>
              <td style={{ ...tdRight, fontWeight: 600 }}>
                {totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}

const th = { textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #ddd' };
const td = { padding: '8px', borderBottom: '1px solid #eee' };
const tdRight = { ...td, textAlign: 'right' };
