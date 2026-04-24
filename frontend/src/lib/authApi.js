const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = new Error(payload?.detail || 'Request failed')
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export function signup(payload) {
  return request('/api/v1/users/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function login(payload) {
  return request('/api/v1/users/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getMe(token) {
  return request('/api/v1/users/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export { API_BASE_URL }
