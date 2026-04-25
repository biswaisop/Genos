const THRESHOLDS = { cpu: 85, memory: 85, disk: 85 }

function fmt(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v)}%`
}

function chipCls(metric, value) {
  if (value === null || value === undefined)
    return 'font-mono text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/30 border border-white/10'
  if (value >= THRESHOLDS[metric])
    return 'font-mono text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30'
  return 'font-mono text-[10px] px-2 py-0.5 rounded bg-brand-yellow/8 text-brand-yellow border border-brand-yellow/20'
}

export default function ServerMetricsBadge({ metrics }) {
  if (!metrics) return (
    <span className="text-[10px] text-white/25 font-mono tracking-wide">metrics pending</span>
  )
  if (metrics.success === false) return (
    <span className="text-[10px] text-red-400/60 font-mono" title={metrics.error}>metrics unavailable</span>
  )

  return (
    <div className="flex items-center gap-1.5 flex-wrap"
         title={metrics.polled_at ? `Polled ${new Date(metrics.polled_at).toLocaleTimeString()}` : ''}>
      <span className={chipCls('cpu',    metrics.cpu_percent)}>CPU {fmt(metrics.cpu_percent)}</span>
      <span className={chipCls('memory', metrics.memory_percent)}>MEM {fmt(metrics.memory_percent)}</span>
      <span className={chipCls('disk',   metrics.disk_percent)}>DISK {fmt(metrics.disk_percent)}</span>
    </div>
  )
}
