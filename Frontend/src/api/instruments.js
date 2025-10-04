// src/api/instruments.js
const API_BASE = import.meta.env?.VITE_API_URL || 'https://pp-capital-zdto.vercel.app/api';

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    },
    ...options
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.replace('/login');
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Fetch all schemes
export async function fetchSchemes() {
  return apiCall('/instruments/schemes');
}

// Fetch instruments with filtering and pagination
export async function fetchInstruments({
  schemeId,
  page = 1,
  limit = 50,
  search = '',
  sort = '',
  filters = {}
} = {}) {
  const params = new URLSearchParams({
    schemeId,
    page: String(page),
    limit: String(limit),
    search,
    sort,
    filters: JSON.stringify(filters)
  });

  return apiCall(`/instruments?${params.toString()}`);
}
