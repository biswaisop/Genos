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

export function listTeams(token) {
  return request('/api/v1/teams/', token)
}

export function createTeam(token, payload) {
  return request('/api/v1/teams/', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getTeam(token, teamId) {
  return request(`/api/v1/teams/${teamId}`, token)
}

export function deleteTeam(token, teamId) {
  return request(`/api/v1/teams/${teamId}`, token, { method: 'DELETE' })
}

export function inviteTeamMember(token, teamId, payload) {
  return request(`/api/v1/teams/${teamId}/invite`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function acceptTeamInvite(token, teamId, notificationId) {
  return request(`/api/v1/teams/${teamId}/invite/accept`, token, {
    method: 'PATCH',
    body: JSON.stringify({ notification_id: notificationId }),
  })
}

export function rejectTeamInvite(token, teamId, notificationId) {
  return request(`/api/v1/teams/${teamId}/invite/reject`, token, {
    method: 'PATCH',
    body: JSON.stringify({ notification_id: notificationId }),
  })
}

export function updateTeamMember(token, teamId, userId, payload) {
  return request(`/api/v1/teams/${teamId}/members/${userId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function removeTeamMember(token, teamId, userId) {
  return request(`/api/v1/teams/${teamId}/members/${userId}`, token, {
    method: 'DELETE',
  })
}

export function addTeamServer(token, teamId, serverId) {
  return request(`/api/v1/teams/${teamId}/servers`, token, {
    method: 'POST',
    body: JSON.stringify({ server_id: serverId }),
  })
}

export function removeTeamServer(token, teamId, serverId) {
  return request(`/api/v1/teams/${teamId}/servers/${encodeURIComponent(serverId)}`, token, {
    method: 'DELETE',
  })
}
