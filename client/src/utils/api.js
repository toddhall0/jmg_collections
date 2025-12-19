const API_BASE = '/api'

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token')

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config)

  // Only redirect to login on 401 (unauthorized/invalid token)
  // 403 means user is authenticated but lacks permission - don't force re-login
  if (response.status === 401) {
    if (endpoint !== '/auth/login' && endpoint !== '/auth/me') {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
  }

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' })
}
