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

// NOTE: the backend exposes the latest snapshot at GET /api/v1/servers/{id}/metrics
// (no /latest suffix). We treat that as "latest" here so callers get the
// naming the frontend expects without adding a duplicate route.
export function getLatestMetrics(token, serverId) {
  const id = normalizeServerId(serverId)
  return request(`/api/v1/servers/${id}/metrics`, token)
}

export function getMetricsHistory(token, serverId, limit = 20) {
  const id = normalizeServerId(serverId)
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100))
  return request(
    `/api/v1/servers/${id}/metrics/history?limit=${safeLimit}`,
    token,
  )
}

export function getServerStatus(token, serverId) {
  const id = normalizeServerId(serverId)
  return request(`/api/v1/servers/${id}/metrics/status`, token)
}
