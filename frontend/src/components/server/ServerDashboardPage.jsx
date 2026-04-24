import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BorderGlow from '../common/BorderGlow'
import VitalsChart from './VitalsChart'
import MetricCard from './MetricCard'
import {
  getLatestMetrics,
  getMetricsHistory,
  getServerStatus,
} from '../../lib/metricsApi'
import './ServerDashboardPage.css'

const POLL_INTERVAL_MS = 30000
const WINDOW_SIZE = 20

const THRESHOLDS = { cpu: 85, memory: 85, disk: 85 }

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function shapeForChart(snapshot) {
  if (!snapshot) return null
  return {
    time: formatTime(snapshot.polled_at),
    cpu_percent:
      typeof snapshot.cpu_percent === 'number' ? snapshot.cpu_percent : null,
    memory_percent:
      typeof snapshot.memory_percent === 'number' ? snapshot.memory_percent : null,
    disk_percent:
      typeof snapshot.disk_percent === 'number' ? snapshot.disk_percent : null,
    polled_at: snapshot.polled_at,
    raw: snapshot,
  }
}

function parseLoadAverage(load) {
  if (!load || typeof load !== 'string') return [null, null, null]
  const parts = load.split(',').map((p) => parseFloat(p.trim()))
  return [0, 1, 2].map((i) => (Number.isFinite(parts[i]) ? parts[i] : null))
}

function ServerDashboardPage({ serverId, onOpenChat, onBack }) {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('genos_access_token')
      : null

  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const pollTimerRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadInitial = useCallback(async () => {
    if (!serverId || !token) {
      setError(serverId ? 'Sign in required.' : 'No server selected.')
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const [statusResp, historyResp] = await Promise.all([
        getServerStatus(token, serverId).catch(() => null),
        getMetricsHistory(token, serverId, WINDOW_SIZE).catch(() => []),
      ])
      if (!mountedRef.current) return
      setStatus(statusResp)
      const shaped = (Array.isArray(historyResp) ? historyResp : [])
        .map(shapeForChart)
        .filter(Boolean)
      setHistory(shaped)
      if (shaped.length > 0) {
        setLatest(shaped[shaped.length - 1].raw)
      }
    } catch (err) {
      if (!mountedRef.current) return
      setError(err?.message || 'Could not load server dashboard.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [serverId, token])

  const tick = useCallback(async () => {
    if (!serverId || !token) return
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const snapshot = await getLatestMetrics(token, serverId)
      if (!mountedRef.current || !snapshot) return
      const shaped = shapeForChart(snapshot)
      if (!shaped) return
      setLatest(snapshot)
      setHistory((prev) => {
        const next = [...prev, shaped]
        if (next.length > WINDOW_SIZE) next.splice(0, next.length - WINDOW_SIZE)
        return next
      })
      // Refresh status occasionally so the badge keeps updating.
      try {
        const s = await getServerStatus(token, serverId)
        if (mountedRef.current) setStatus(s)
      } catch {
        /* non-fatal */
      }
    } catch {
      /* keep last good state, transient errors are silent */
    }
  }, [serverId, token])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!serverId || !token) return undefined
    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [tick, serverId, token])

  const cpuSeries = useMemo(
    () => history.map((h) => h.cpu_percent).filter((v) => typeof v === 'number'),
    [history],
  )
  const memSeries = useMemo(
    () =>
      history.map((h) => h.memory_percent).filter((v) => typeof v === 'number'),
    [history],
  )
  const diskSeries = useMemo(
    () =>
      history.map((h) => h.disk_percent).filter((v) => typeof v === 'number'),
    [history],
  )

  const loadAvg = useMemo(() => parseLoadAverage(latest?.load_average), [latest])
  const isOnline = (status?.status || '').toLowerCase() === 'connected'
  const hasData = history.length > 0
  const displayName = status?.host || serverId || ''

  return (
    <main className="server-dashboard">
      <div className="server-dashboard__topbar">
        <button
          type="button"
          className="server-dashboard__back"
          onClick={() => onBack && onBack()}
        >
          ← Back to Dashboard
        </button>
        <div className="server-dashboard__topbar-right">
          <span
            className={`server-status-pill server-status-pill--${
              isOnline ? 'online' : 'offline'
            }`}
          >
            <span className="server-status-dot" />
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {status?.host ? (
            <span className="server-status-host">{status.host}</span>
          ) : null}
          {status?.last_seen ? (
            <span className="server-status-last">
              Last seen {formatTime(status.last_seen)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="server-dashboard__title-row">
        <div>
          <h1 className="server-dashboard__title">{displayName || 'Server'}</h1>
          <p className="server-dashboard__subtitle">
            Live vitals refresh every 30 seconds.
          </p>
        </div>
        <button
          type="button"
          className="server-dashboard__chat-cta"
          onClick={() => onOpenChat && onOpenChat(serverId)}
        >
          Open Chat →
        </button>
      </div>

      {error ? (
        <div className="server-dashboard__error">{error}</div>
      ) : null}

      {!isOnline && !loading ? (
        <div className="server-dashboard__offline-banner">
          Server offline — metrics may be stale.
        </div>
      ) : null}

      <section className="server-dashboard__metric-grid">
        <MetricCard
          label="CPU"
          value={latest?.cpu_percent}
          sparkline={cpuSeries}
        />
        <MetricCard
          label="Memory"
          value={latest?.memory_percent}
          sparkline={memSeries}
        />
        <MetricCard
          label="Disk"
          value={latest?.disk_percent}
          sparkline={diskSeries}
        />
        <BorderGlow
          as="article"
          className="metric-card metric-card--load"
          glowColor="270 100% 75%"
        >
          <header className="metric-card__head">
            <span className="metric-card__label">Load Avg</span>
            <span className="metric-card__unit">1 / 5 / 15 min</span>
          </header>
          <div className="metric-card__load-row">
            {loadAvg.map((v, i) => (
              <div key={i} className="metric-card__load-cell">
                <span className="metric-card__value metric-card__value--small">
                  {v === null ? '—' : v.toFixed(2)}
                </span>
                <span className="metric-card__load-label">
                  {['1m', '5m', '15m'][i]}
                </span>
              </div>
            ))}
          </div>
        </BorderGlow>
      </section>

      {loading && !hasData ? (
        <section className="server-dashboard__skeletons">
          <BorderGlow as="div" className="server-dashboard__skeleton" glowColor="270 100% 75%" />
          <BorderGlow as="div" className="server-dashboard__skeleton" glowColor="270 100% 75%" />
          <BorderGlow as="div" className="server-dashboard__skeleton" glowColor="270 100% 75%" />
        </section>
      ) : !hasData ? (
        <section className="server-dashboard__empty">
          <BorderGlow as="div" className="server-dashboard__empty-card" glowColor="270 100% 75%">
            <h3>No data yet</h3>
            <p>
              The anomaly poller hasn't recorded a snapshot for this server yet.
              Once it does, charts will populate automatically.
            </p>
          </BorderGlow>
        </section>
      ) : (
        <>
          <section className="server-dashboard__chart-block">
            <header className="server-dashboard__chart-head">
              <h2>CPU Usage</h2>
              <span>last {history.length} polls</span>
            </header>
            <BorderGlow as="div" className="server-dashboard__chart-panel" glowColor="270 100% 75%">
              <div className="server-dashboard__chart-canvas">
                <VitalsChart
                  kind="line"
                  data={history}
                  dataKey="cpu_percent"
                  metric="cpu"
                  threshold={THRESHOLDS.cpu}
                />
              </div>
            </BorderGlow>
          </section>

          <section className="server-dashboard__chart-block">
            <header className="server-dashboard__chart-head">
              <h2>Memory Usage</h2>
              <span>last {history.length} polls</span>
            </header>
            <BorderGlow as="div" className="server-dashboard__chart-panel" glowColor="270 100% 75%">
              <div className="server-dashboard__chart-canvas">
                <VitalsChart
                  kind="area"
                  data={history}
                  dataKey="memory_percent"
                  metric="memory"
                  threshold={THRESHOLDS.memory}
                />
              </div>
            </BorderGlow>
          </section>

          <section className="server-dashboard__chart-block">
            <header className="server-dashboard__chart-head">
              <h2>Disk Usage</h2>
              <span>current snapshot</span>
            </header>
            <BorderGlow as="div" className="server-dashboard__chart-panel server-dashboard__chart-panel--radial" glowColor="270 100% 75%">
              <div className="server-dashboard__chart-canvas server-dashboard__chart-canvas--radial">
                <VitalsChart kind="radial" value={latest?.disk_percent} />
              </div>
            </BorderGlow>
          </section>
        </>
      )}
    </main>
  )
}

export default ServerDashboardPage
