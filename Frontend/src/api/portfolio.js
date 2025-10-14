const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Get complete portfolio data
 */
export async function getPortfolio(userId) {
  const response = await fetch(`${API_BASE}/portfolio?userId=${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch portfolio');
  }
  return response.json();
}

/**
 * Get holdings with pagination
 */
export async function getHoldings(userId, page = 1, limit = 100) {
  const response = await fetch(`${API_BASE}/portfolio/holdings?userId=${userId}&page=${page}&limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch holdings');
  }
  return response.json();
}

/**
 * Get sold transactions
 */
export async function getSold(userId, page = 1, limit = 100) {
  const response = await fetch(`${API_BASE}/portfolio/sold?userId=${userId}&page=${page}&limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch sold transactions');
  }
  return response.json();
}

/**
 * Add a new transaction
 */
export async function addTransaction(userId, transactionData) {
  const response = await fetch(`${API_BASE}/portfolio/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      ...transactionData,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add transaction');
  }
  
  return response.json();
}

/**
 * Get issuer details by ISIN
 */
export async function getIssuerByIsin(isin) {
  const response = await fetch(`${API_BASE}/portfolio/issuers/${isin}`);
  if (!response.ok) {
    throw new Error('Failed to fetch issuer details');
  }
  return response.json();
}

/**
 * Bulk update prices (admin)
 */
export async function bulkUpdatePrices(priceUpdates) {
  const response = await fetch(`${API_BASE}/portfolio/prices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(priceUpdates),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update prices');
  }
  
  return response.json();
}

