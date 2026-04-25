import { useEffect, useMemo, useRef, useState } from 'react'
import {
  connectServer,
  deleteServer,
  disconnectServer,
  getServerMetrics,
  listServers,
} from '../../lib/serverApi'
import { refreshServerMetrics } from '../../lib/metricsApi'
import ServerMetricsBadge from './ServerMetricsBadge'

// ── Role pill ─────────────────────────────────────────────────────────────────

function RolePill({ role }) {
  if (!role || role === 'personal') return null
  const cls = {
    admin:    'bg-purple-500/15 text-purple-300 border-purple-500/30',
    operator: 'bg-blue-500/15   text-blue-300   border-blue-500/30',
    viewer:   'bg-white/8       text-white/40   border-white/15',
    owner:    'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/30',
  }[role] || 'bg-white/8 text-white/40 border-white/15'
  return (
    <span className={`pill text-[10px] capitalize ${cls}`}>{role}</span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent = false }) {
  return (
    <div className="glow-card p-5 flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-widest text-white/35">{label}</p>
      <p className={`text-3xl font-bold font-mono ${accent ? 'text-brand-yellow' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────────────────────

function ContextMenu({ items }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-brand-black-raised
                    border border-brand-border rounded-xl shadow-xl overflow-hidden animate-fade-in">
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={item.onClick}
          className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                      ${item.danger
                        ? 'text-red-400 hover:bg-red-500/10'
                        : 'text-white/70 hover:bg-white/5'}
                      disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ── Server card ───────────────────────────────────────────────────────────────

function ServerCard({ connection, online, metrics, actionLoading, actionsOpen, onToggleMenu, onAction, onOpenServer }) {
  const sid = connection.server_id
  const menuRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!actionsOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onToggleMenu() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [actionsOpen, onToggleMenu])

  const menuItems = online
    ? [
        {
          label: actionLoading === `disconnect:${sid}` ? 'Disconnecting…' : 'Disconnect',
          disabled: !sid || !!actionLoading,
          onClick: () => onAction('disconnect', sid),
        },
        {
          label: actionLoading === `delete:${sid}` ? 'Removing…' : 'Remove',
          disabled: !sid || !!actionLoading,
          onClick: () => onAction('delete', sid),
          danger: true,
        },
      ]
    : [
        {
          label: actionLoading === `connect:${sid}` ? 'Reconnecting…' : 'Reconnect',
          disabled: !sid || !!actionLoading,
          onClick: () => onAction('connect', sid),
        },
        {
          label: actionLoading === `delete:${sid}` ? 'Removing…' : 'Remove',
          disabled: !sid || !!actionLoading,
          onClick: () => onAction('delete', sid),
          danger: true,
        },
      ]

  return (
    <article className={`glow-card p-5 flex flex-col gap-4 transition-all duration-300
                         ${online ? 'hover:shadow-yellow-glow' : 'opacity-70 hover:opacity-90'}`}>

      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status dot */}
            <span className={`w-2 h-2 rounded-full shrink-0 ${online ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' : 'bg-white/20'}`} />
            <h3 className="text-white font-semibold text-sm truncate">
              {connection.name || sid}
            </h3>
            <RolePill role={connection.role} />
          </div>
          <p className="text-white/30 text-xs font-mono mt-1 truncate">
            {connection.host || 'No host'}
            {connection.port && connection.port !== 22 ? `:${connection.port}` : ''}
          </p>
        </div>

        {/* Status badge + menu */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`pill text-[10px] ${
            online
              ? 'bg-green-500/12 text-green-400 border-green-500/25'
              : 'bg-white/8 text-white/35 border-white/15'
          }`}>
            {online ? 'Online' : connection.status || 'Offline'}
          </span>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Server options"
              onClick={onToggleMenu}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40
                         hover:bg-white/8 hover:text-white transition-colors text-base leading-none"
            >
              ⋯
            </button>
            {actionsOpen && <ContextMenu items={menuItems} />}
          </div>
        </div>
      </div>

      {/* Metrics */}
      {online && (
        <div className="border-t border-white/5 pt-3">
          <ServerMetricsBadge metrics={metrics} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3">
        <p className="text-white/25 text-xs truncate">
          {online
            ? `Since: ${connection.last_connected_at || 'recently'}`
            : `Last seen: ${connection.last_connected_at || 'unknown'}`}
        </p>
        <button
          type="button"
          disabled={!sid}
          onClick={() => onOpenServer?.(sid)}
          className="btn-yellow text-xs px-3 py-1.5 shrink-0"
        >
          Open →
        </button>
      </div>
    </article>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-yellow/8 border border-brand-yellow/15
                      flex items-center justify-center text-3xl">
        🖥️
      </div>
      <div>
        <p className="text-white font-semibold">No servers yet</p>
        <p className="text-white/40 text-sm mt-1">Add your first server to get started.</p>
      </div>
      <button onClick={onAdd} className="btn-yellow px-6 py-2">
        + Add server
      </button>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage({ onAddConnection, onOpenServer }) {
  const [actionsOpenFor, setActionsOpenFor] = useState(null)
  const [connections, setConnections]       = useState([])
  const [loading, setLoading]               = useState(false)
  const [feedback, setFeedback]             = useState('')
  const [actionLoading, setActionLoading]   = useState('')
  const [metricsByServer, setMetricsByServer] = useState({})
  const token = localStorage.getItem('genos_access_token')

  const online = useMemo(() => connections.filter(c => c.status === 'connected'), [connections])
  const offline = useMemo(() => connections.filter(c => c.status !== 'connected'), [connections])

  async function refreshConnections({ forcePoll = false } = {}) {
    if (!token) { setFeedback('Please sign in.'); return }
    try {
      setLoading(true)
      const data = await listServers(token)
      const list = Array.isArray(data) ? data : []
      setConnections(list)
      setFeedback('')

      const connected = list.filter(s => s.status === 'connected' && s.server_id)

      if (forcePoll && connected.length > 0) {
        await Promise.allSettled(connected.map(s => refreshServerMetrics(token, s.server_id)))
      }

      const pairs = await Promise.all(
        connected.map(async s => {
          try { return [s.server_id, await getServerMetrics(token, s.server_id)] }
          catch { return [s.server_id, null] }
        })
      )
      setMetricsByServer(Object.fromEntries(pairs))
    } catch (err) {
      setFeedback(err.message || 'Could not load servers.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(action, serverId) {
    if (!token) { setFeedback('Session expired.'); return }
    if (!serverId) { setFeedback('Missing server ID.'); return }
    try {
      setActionLoading(`${action}:${serverId}`)
      setFeedback('')
      if (action === 'connect')    await connectServer(token, serverId)
      if (action === 'disconnect') await disconnectServer(token, serverId)
      if (action === 'delete')     await deleteServer(token, serverId)
      setActionsOpenFor(null)
      await refreshConnections()
    } catch (err) {
      setFeedback(err?.payload?.detail || err.message || `Failed to ${action}.`)
    } finally {
      setActionLoading('')
    }
  }

  useEffect(() => { refreshConnections() }, [])

  const cardKey = c => c.server_id || `${c.name || 'unnamed'}:${c.host}`

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-8 py-10 flex flex-col gap-10 text-left animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Monitor and manage your connected servers.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refreshConnections({ forcePoll: true })}
            disabled={loading}
            className="btn-ghost text-sm px-4 py-2"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button onClick={onAddConnection} className="btn-yellow text-sm px-4 py-2">
            + Add server
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <StatCard label="Total"        value={connections.length} />
        <StatCard label="Online"       value={online.length}      accent />
        <StatCard label="Disconnected" value={offline.length}     />
      </div>

      {/* Feedback banner */}
      {feedback ? (
        <div className="text-brand-yellow/80 bg-brand-yellow/8 border border-brand-yellow/20
                        rounded-lg px-4 py-2.5 text-sm animate-fade-in">
          {feedback}
        </div>
      ) : null}

      {/* Empty state */}
      {!loading && connections.length === 0 && (
        <EmptyState onAdd={onAddConnection} />
      )}

      {/* Online servers */}
      {online.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">
              Online — {online.length}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {online.map((c, i) => {
              const key = `online:${i}`
              return (
                <ServerCard
                  key={cardKey(c)}
                  connection={c}
                  online
                  metrics={metricsByServer[c.server_id]}
                  actionLoading={actionLoading}
                  actionsOpen={actionsOpenFor === key}
                  onToggleMenu={() => setActionsOpenFor(p => p === key ? null : key)}
                  onAction={handleAction}
                  onOpenServer={onOpenServer}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Offline servers */}
      {offline.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-white/20" />
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
              Offline — {offline.length}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {offline.map((c, i) => {
              const key = `offline:${i}`
              return (
                <ServerCard
                  key={cardKey(c)}
                  connection={c}
                  online={false}
                  metrics={null}
                  actionLoading={actionLoading}
                  actionsOpen={actionsOpenFor === key}
                  onToggleMenu={() => setActionsOpenFor(p => p === key ? null : key)}
                  onAction={handleAction}
                  onOpenServer={onOpenServer}
                />
              )
            })}
          </div>
        </section>
      )}

    </main>
  )
}
