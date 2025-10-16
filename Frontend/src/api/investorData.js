const API_BASE = import.meta.env?.VITE_API_URL || 'https://mutual-funds-kohl.vercel.app/api';

/**
 * Fetch investor/issuer data with pagination and search
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @param {string} params.issuer - Issuer name to search for
 * @returns {Promise<Object>} Response with items, pagination info
 */
export async function fetchInvestorData({ page = 1, limit = 50, issuer = '' } = {}) {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('limit', limit);
  if (issuer.trim()) {
    params.append('issuer', issuer.trim());
  }

  const response = await fetch(`${API_BASE}/investor-data?${params}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch investor data: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch unique issuers for autocomplete/suggestions
 * @param {string} search - Search term for filtering issuers
 * @returns {Promise<Object>} Response with array of issuer names
 */
export async function fetchIssuers(search = '') {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.append('search', search.trim());
  }

  const response = await fetch(`${API_BASE}/investor-data/issuers?${params}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch issuers: ${response.statusText}`);
  }

  return response.json();
}

