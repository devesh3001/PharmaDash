const BASE = window.location.origin.includes('localhost') ? 'http://localhost:8080' : '';

const getToken = () => localStorage.getItem('pd_token');

async function req(path, opts = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
    });
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your internet connection.');
    }
    throw error;
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }
  
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      window.dispatchEvent(new Event('unauthorized'));
    }
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  login:        (body) => req('/api/auth/login',    { method: 'POST', body: JSON.stringify(body) }),
  register:     (body) => req('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  getMe:        ()     => req('/api/users/me'),
  getMedicines: ()     => req('/api/medicines'),
  getPharmacies:()     => req('/api/pharmacies'),
  createOrder:  (body) => req('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  getOrders:    (params = {}) => req(`/api/orders?${new URLSearchParams(params)}`),
  getOrder:     (id)   => req(`/api/orders/${id}`),
  processPayment: (id, payload) => req(`/api/orders/${id}/payment`, { method: 'POST', body: JSON.stringify(payload) }),
  updateOrderStatus: (id, status) => req(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  // Inventory (admin)
  getInventory:  (params = {}) => req(`/api/inventory?${new URLSearchParams(params)}`),
  updateStock:   (id, stock_quantity) => req(`/api/inventory/${id}`, { method: 'PATCH', body: JSON.stringify({ stock_quantity }) }),
  // Users (admin)
  getUsers:     (params = {}) => req(`/api/users?${new URLSearchParams(params)}`),
  getAdminStats:() => req('/api/admin/analytics'),
  scanPrescription: (formData) => req('/api/medicines/scan', { method: 'POST', body: formData, headers: { 'Content-Type': undefined } }),
};
