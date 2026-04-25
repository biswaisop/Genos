import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VitalsChart from './VitalsChart'
import MetricCard from './MetricCard'
import {
  getLatestMetrics, getMetricsHistory, getServerStatus, refreshServerMetrics,
} from '../../lib/metricsApi'

const POLL_INTERVAL_MS = 15000
const WINDOW_SIZE = 20
const THRESHOLDS = { cpu: 85, memory: 85, disk: 85 }

function formatTime(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

function shapeForChart(snapshot) {
  if (!snapshot) return null
  return {
    time: formatTime(snapshot.polled_at),
    cpu_percent:    typeof snapshot.cpu_percent    === 'number' ? snapshot.cpu_percent    : null,
    memory_percent: typeof snapshot.memory_percent === 'number' ? snapshot.memory_percent : null,
    disk_percent:   typeof snapshot.disk_percent   === 'number' ? snapshot.disk_percent   : null,
    polled_at: snapshot.polled_at,
    raw: snapshot,
  }
}

function parseLoadAverage(load) {
  if (!load || typeof load !== 'string') return [null, null, null]
  const parts = load.split(',').map(p => parseFloat(p.trim()))
  return [0, 1, 2].map(i => (Number.isFinite(parts[i]) ? parts[i] : null))
}

function ChartBlock({ title, subtitle, height = 'h-48', children }) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">{title}</h2>
        {subtitle && <span className="text-xs text-white/25">{subtitle}</span>}
      </header>
      <div className="glow-card p-4">
        <div className={height}>{children}</div>
      </div>
    </section>
  )
}

export default function ServerDashboardPage({ serverId, onOpenChat, onBack }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('genos_access_token') : null

  const [status,    setStatus]    = useState(null)
  const [history,   setHistory]   = useState([])
  const [latest,    setLatest]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')

  const pollTimerRef = useRef(null)
  const mountedRef   = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadInitial = useCallback(async () => {
    if (!serverId || !token) {
      setError(serverId ? 'Sign in required.' : 'No server selected.')
      setLoading(false)
      return
    }
    try {
      setLoading(true); setError('')
      const [statusResp, historyResp] = await Promise.all([
        getServerStatus(token, serverId).catch(() => null),
        getMetricsHistory(token, serverId, WINDOW_SIZE).catch(() => []),
      ])
      if (!mountedRef.current) return
      setStatus(statusResp)
      const shaped = (Array.isArray(historyResp) ? historyResp : []).map(shapeForChart).filter(Boolean)
      setHistory(shaped)
      if (shaped.length > 0) setLatest(shaped[shaped.length - 1].raw)
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
      setHistory(prev => {
        const next = [...prev, shaped]
        if (next.length > WINDOW_SIZE) next.splice(0, next.length - WINDOW_SIZE)
        return next
      })
      try { const s = await getServerStatus(token, serverId); if (mountedRef.current) setStatus(s) }
      catch { /* non-fatal */ }
    } catch { /* keep last good state */ }
  }, [serverId, token])

  useEffect(() => { loadInitial() }, [loadInitial])

  useEffect(() => {
    if (!serverId || !token) return
    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS)
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  }, [tick, serverId, token])

  const handleRefreshNow = useCallback(async () => {
    if (!serverId || !token || refreshing) return
    setRefreshing(true); setRefreshError('')
    try {
      const snapshot = await refreshServerMetrics(token, serverId)
      if (!mountedRef.current || !snapshot) return
      const shaped = shapeForChart(snapshot)
      if (shaped) {
        setLatest(snapshot)
        setHistory(prev => {
          const next = [...prev, shaped]
          if (next.length > WINDOW_SIZE) next.splice(0, next.length - WINDOW_SIZE)
          return next
        })
      }
      try { const s = await getServerStatus(token, serverId); if (mountedRef.current) setStatus(s) }
      catch { /* non-fatal */ }
    } catch (err) {
      if (!mountedRef.current) return
      setRefreshError(err?.status === 409
        ? 'Server not connected — reconnect first.'
        : err?.message || 'Refresh failed.')
    } finally { if (mountedRef.current) setRefreshing(false) }
  }, [serverId, token, refreshing])

  const cpuSeries  = useMemo(() => history.map(h => h.cpu_percent).filter(v => typeof v === 'number'), [history])
  const memSeries  = useMemo(() => history.map(h => h.memory_percent).filter(v => typeof v === 'number'), [history])
  const diskSeries = useMemo(() => history.map(h => h.disk_percent).filter(v => typeof v === 'number'), [history])
  const loadAvg    = useMemo(() => parseLoadAverage(latest?.load_average), [latest])

  const isOnline   = (status?.status || '').toLowerCase() === 'connected'
  const hasData    = history.length > 0
  const displayName = status?.host || serverId || 'Server'

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-8 flex flex-col gap-8 animate-fade-in">

      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button onClick={() => onBack?.()} className="btn-ghost text-sm px-3 py-1.5">
            ← Dashboard
          </button>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' : 'bg-white/20'}`} />
            <h1 className="text-xl font-bold text-white">{displayName}</h1>
          </div>
          {status?.last_seen && (
            <span className="text-white/25 text-xs hidden sm:inline">
              Last seen {formatTime(status.last_seen)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshNow}
            disabled={refreshing || !isOnline}
            className="btn-ghost text-sm px-3 py-1.5"
            title={isOnline ? 'Force a fresh poll' : 'Server is offline'}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh now'}
          </button>
          <button
            onClick={() => onOpenChat?.(serverId)}
            className="btn-yellow text-sm px-4 py-1.5"
          >
            Open Chat →
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {!isOnline && !loading && (
        <div className="text-brand-yellow/70 bg-brand-yellow/8 border border-brand-yellow/20
                        rounded-lg px-4 py-2.5 text-sm">
          ⚠ Server offline — displayed metrics may be stale.
        </div>
      )}

      {/* Errors */}
      {(error || refreshError) && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-2.5 text-sm">
          {error || refreshError}
        </div>
      )}

      {/* Metric cards */}
      {loading && !hasData ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-white/5 animate-shimmer" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="CPU"    value={latest?.cpu_percent}    sparkline={cpuSeries} />
          <MetricCard label="Memory" value={latest?.memory_percent} sparkline={memSeries} />
          <MetricCard label="Disk"   value={latest?.disk_percent}   sparkline={diskSeries} />

          {/* Load average card */}
          <article className="glow-card p-5 flex flex-col gap-3">
            <header className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/35">Load Avg</span>
              <span className="text-[10px] text-white/25">1m / 5m / 15m</span>
            </header>
            <div className="flex items-end gap-4">
              {loadAvg.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className="text-2xl font-bold font-mono text-white">
                    {v === null ? '—' : v.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-white/25">{['1m','5m','15m'][i]}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}

      {/* Charts */}
      {!loading && !hasData && (
        <div className="glow-card p-10 flex flex-col items-center gap-3 text-center">
          <div className="text-3xl">📊</div>
          <p className="text-white font-semibold">No data yet</p>
          <p className="text-white/35 text-sm">
            The anomaly poller hasn't recorded a snapshot for this server. Charts populate automatically.
          </p>
        </div>
      )}

      {hasData && (
        <>
          <ChartBlock title="CPU Usage" subtitle={`last ${history.length} polls`}>
            <VitalsChart kind="line" data={history} dataKey="cpu_percent" metric="cpu" threshold={THRESHOLDS.cpu} />
          </ChartBlock>

          <ChartBlock title="Memory Usage" subtitle={`last ${history.length} polls`}>
            <VitalsChart kind="area" data={history} dataKey="memory_percent" metric="memory" threshold={THRESHOLDS.memory} />
          </ChartBlock>

          <ChartBlock title="Disk Usage" subtitle="current snapshot" height="h-72">
            <VitalsChart kind="pie" value={latest?.disk_percent} />
          </ChartBlock>
        </>
      )}
    </main>
  )
}
