const THRESHOLDS = { cpu: 85, memory: 85, disk: 85 }

function formatValue(value) {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value)}%`
}

function chipClass(metric, value) {
  if (value === null || value === undefined) return 'metric-chip metric-chip--muted'
  if (value >= THRESHOLDS[metric]) return 'metric-chip metric-chip--breach'
  return 'metric-chip'
}

function ServerMetricsBadge({ metrics }) {
  if (!metrics) {
    return (
      <div className="metrics-badge metrics-badge--empty" title="No metrics collected yet">
        Metrics pending
      </div>
    )
  }

  if (metrics.success === false) {
    return (
      <div className="metrics-badge metrics-badge--err" title={metrics.error || 'Metrics collection failed'}>
        Metrics unavailable
      </div>
    )
  }

  return (
    <div
      className="metrics-badge"
      title={`Polled ${metrics.polled_at ? new Date(metrics.polled_at).toLocaleTimeString() : ''}`}
    >
      <span className={chipClass('cpu', metrics.cpu_percent)} aria-label="CPU">
        CPU {formatValue(metrics.cpu_percent)}
      </span>
      <span className={chipClass('memory', metrics.memory_percent)} aria-label="Memory">
        MEM {formatValue(metrics.memory_percent)}
      </span>
      <span className={chipClass('disk', metrics.disk_percent)} aria-label="Disk">
        DISK {formatValue(metrics.disk_percent)}
      </span>
    </div>
  )
}

export default ServerMetricsBadge
