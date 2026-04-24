import { useState } from 'react'

function formatWhen(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    const diffMs = Date.now() - d.getTime()
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.round(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    return d.toLocaleString()
  } catch {
    return ''
  }
}

function NotificationItem({ notification, onAcceptInvite, onRejectInvite, onDismiss, onMarkRead }) {
  const { id, type, payload = {}, read, created_at } = notification
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn) => {
    if (!fn) return
    setBusy(true)
    setError('')
    try {
      await fn(notification)
    } catch (err) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (type === 'team_invite') {
    return (
      <div className={`notification-item notification-item--invite${read ? ' notification-item--read' : ''}`}>
        <div className="notification-item__body">
          <div className="notification-item__title">
            Team invite: <strong>{payload.team_name || 'Unnamed team'}</strong>
          </div>
          <div className="notification-item__meta">
            {payload.invited_by ? `from ${payload.invited_by}` : null}
            {payload.role ? (
              <span className="notification-item__role">{payload.role}</span>
            ) : null}
            <span className="notification-item__time">{formatWhen(created_at)}</span>
          </div>
          {Array.isArray(payload.server_ids) && payload.server_ids.length > 0 ? (
            <div className="notification-item__meta">
              {payload.server_ids.length} server{payload.server_ids.length === 1 ? '' : 's'} shared
            </div>
          ) : null}
          {error ? <div className="notification-item__error">{error}</div> : null}
        </div>
        <div className="notification-item__actions">
          <button
            type="button"
            className="notification-btn notification-btn--accept"
            disabled={busy}
            onClick={() => run(onAcceptInvite)}
          >
            Accept
          </button>
          <button
            type="button"
            className="notification-btn notification-btn--reject"
            disabled={busy}
            onClick={() => run(onRejectInvite)}
          >
            Reject
          </button>
        </div>
      </div>
    )
  }

  if (type === 'anomaly_alert') {
    const metricLabel = payload.metric ? payload.metric.toUpperCase() : 'METRIC'
    const value = typeof payload.value === 'number' ? `${payload.value.toFixed(1)}%` : ''
    return (
      <div className={`notification-item notification-item--anomaly${read ? ' notification-item--read' : ''}`}>
        <div className="notification-item__body">
          <div className="notification-item__title">
            {metricLabel} high on <strong>{payload.server_name || payload.server_id || 'server'}</strong>
          </div>
          <div className="notification-item__meta">
            {value ? <span className="notification-item__value">{value}</span> : null}
            <span className="notification-item__time">{formatWhen(created_at)}</span>
          </div>
          {error ? <div className="notification-item__error">{error}</div> : null}
        </div>
        <div className="notification-item__actions">
          {!read ? (
            <button
              type="button"
              className="notification-btn"
              disabled={busy}
              onClick={() => run(onMarkRead)}
            >
              Mark read
            </button>
          ) : null}
          <button
            type="button"
            className="notification-btn notification-btn--reject"
            disabled={busy}
            onClick={() => run(onDismiss)}
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`notification-item${read ? ' notification-item--read' : ''}`}>
      <div className="notification-item__body">
        <div className="notification-item__title">Notification</div>
        <div className="notification-item__meta">
          <span className="notification-item__time">{formatWhen(created_at)}</span>
        </div>
      </div>
    </div>
  )
}

export default NotificationItem
