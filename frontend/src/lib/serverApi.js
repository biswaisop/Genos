import { API_BASE_URL } from './authApi'

function normalizeServerId(serverId) {
  if (!serverId) return ''
  try {
    return decodeURIComponent(serverId)
  } catch {
    return serverId
  }
}

async function request(path, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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

export function listServers(token) {
  return request('/api/v1/servers/', token)
}

export function createServer(token, payload) {
  return request('/api/v1/servers/', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function testServer(token, serverId) {
  const normalizedServerId = normalizeServerId(serverId)
  return request(`/api/v1/servers/${normalizedServerId}/test`, token)
}

export function connectServer(token, serverId) {
  const normalizedServerId = normalizeServerId(serverId)
  return request(`/api/v1/servers/${normalizedServerId}/connect`, token, { method: 'POST' })
}

export function disconnectServer(token, serverId) {
  const normalizedServerId = normalizeServerId(serverId)
  return request(`/api/v1/servers/${normalizedServerId}/disconnect`, token, { method: 'POST' })
}

export function deleteServer(token, serverId) {
  const normalizedServerId = normalizeServerId(serverId)
  return request(`/api/v1/servers/${normalizedServerId}`, token, { method: 'DELETE' })
}

export function getServerMetrics(token, serverId) {
  const normalizedServerId = normalizeServerId(serverId)
  return request(`/api/v1/servers/${normalizedServerId}/metrics`, token)
}

export function getServerMetricsHistory(token, serverId, hours = 24) {
  const normalizedServerId = normalizeServerId(serverId)
  return request(
    `/api/v1/servers/${normalizedServerId}/metrics/history?hours=${hours}`,
    token,
  )
}
