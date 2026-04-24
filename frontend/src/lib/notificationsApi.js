import { API_BASE_URL } from './authApi'

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

export function listNotifications(token, { onlyUnread = false } = {}) {
  const qs = onlyUnread ? '?only_unread=true' : ''
  return request(`/api/v1/notifications/${qs}`, token)
}

export function markNotificationRead(token, notificationId) {
  return request(`/api/v1/notifications/${notificationId}/read`, token, {
    method: 'PATCH',
  })
}

export function markAllNotificationsRead(token) {
  return request('/api/v1/notifications/read-all', token, { method: 'PATCH' })
}

export function deleteNotification(token, notificationId) {
  return request(`/api/v1/notifications/${notificationId}`, token, {
    method: 'DELETE',
  })
}
