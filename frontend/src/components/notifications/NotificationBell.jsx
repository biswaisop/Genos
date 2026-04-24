import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../lib/notificationsApi'
import { acceptTeamInvite, rejectTeamInvite } from '../../lib/teamsApi'
import NotificationItem from './NotificationItem'

const POLL_INTERVAL_MS = 30000

function NotificationBell({ token, onOpenTeam }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef(null)
  const pollRef = useRef(null)

  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null)

  const refresh = useCallback(async () => {
    if (!activeToken) return
    try {
      setLoading(true)
      const data = await listNotifications(activeToken)
      setNotifications(data?.notifications || [])
      setUnreadCount(data?.unread_count || 0)
      setError('')
    } catch (err) {
      setError(err?.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [activeToken])

  useEffect(() => {
    if (!activeToken) {
      setNotifications([])
      setUnreadCount(0)
      return undefined
    }

    refresh()

    const tick = () => {
      if (document.visibilityState === 'hidden') return
      refresh()
    }
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [activeToken, refresh])

  useEffect(() => {
    if (!open) return undefined
    const onClick = (event) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleToggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      await refresh()
    }
  }

  const handleMarkAll = async () => {
    if (!activeToken) return
    try {
      await markAllNotificationsRead(activeToken)
      await refresh()
    } catch (err) {
      setError(err?.message || 'Failed to mark notifications read')
    }
  }

  const handleAcceptInvite = useCallback(
    async (notification) => {
      const teamId = notification?.payload?.team_id
      if (!teamId || !activeToken) return
      await acceptTeamInvite(activeToken, teamId, notification.id)
      await refresh()
      if (onOpenTeam) onOpenTeam(teamId)
    },
    [activeToken, onOpenTeam, refresh],
  )

  const handleRejectInvite = useCallback(
    async (notification) => {
      const teamId = notification?.payload?.team_id
      if (!teamId || !activeToken) return
      await rejectTeamInvite(activeToken, teamId, notification.id)
      await refresh()
    },
    [activeToken, refresh],
  )

  const handleDismiss = useCallback(
    async (notification) => {
      if (!activeToken) return
      await deleteNotification(activeToken, notification.id)
      await refresh()
    },
    [activeToken, refresh],
  )

  const handleMarkOneRead = useCallback(
    async (notification) => {
      if (!activeToken) return
      await markNotificationRead(activeToken, notification.id)
      await refresh()
    },
    [activeToken, refresh],
  )

  const badgeLabel = useMemo(() => {
    if (unreadCount <= 0) return null
    if (unreadCount > 9) return '9+'
    return String(unreadCount)
  }, [unreadCount])

  if (!activeToken) return null

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell__button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2a7 7 0 0 0-7 7v3.586l-1.707 1.707A1 1 0 0 0 4 16h16a1 1 0 0 0 .707-1.707L19 12.586V9a7 7 0 0 0-7-7Zm0 20a3 3 0 0 0 2.995-2.824L15 19H9a3 3 0 0 0 3 3Z" />
        </svg>
        {badgeLabel ? <span className="notification-bell__badge">{badgeLabel}</span> : null}
      </button>

      {open ? (
        <div className="notification-dropdown" role="dialog" aria-label="Notifications">
          <div className="notification-dropdown__header">
            <span className="notification-dropdown__title">Notifications</span>
            <button
              type="button"
              className="notification-dropdown__mark"
              onClick={handleMarkAll}
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
          </div>
          <div className="notification-dropdown__body">
            {loading && notifications.length === 0 ? (
              <div className="notification-dropdown__empty">Loading…</div>
            ) : error ? (
              <div className="notification-dropdown__empty notification-dropdown__empty--error">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="notification-dropdown__empty">You're all caught up.</div>
            ) : (
              notifications.map((item) => (
                <NotificationItem
                  key={item.id}
                  notification={item}
                  onAcceptInvite={handleAcceptInvite}
                  onRejectInvite={handleRejectInvite}
                  onDismiss={handleDismiss}
                  onMarkRead={handleMarkOneRead}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default NotificationBell
