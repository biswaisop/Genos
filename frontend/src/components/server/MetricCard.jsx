import { useMemo } from 'react'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from 'recharts'
import BorderGlow from '../common/BorderGlow'

function tierFor(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'muted'
  if (value >= 80) return 'hot'
  if (value >= 60) return 'warm'
  return 'cool'
}

function formatBig(value, suffix) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const fixed = Number(value).toFixed(1)
  return suffix ? `${fixed}${suffix}` : fixed
}

function MetricCard({ label, value, suffix = '%', sparkline = [], unit, hint }) {
  const tier = tierFor(typeof value === 'number' ? value : null)

  const sparkData = useMemo(() => {
    if (!Array.isArray(sparkline) || sparkline.length === 0) return []
    return sparkline
      .filter((v) => typeof v === 'number' && !Number.isNaN(v))
      .slice(-5)
      .map((v, i) => ({ i, v }))
  }, [sparkline])

  const strokeColor =
    tier === 'hot' ? '#fef08a' : tier === 'warm' ? '#facc15' : '#fafafa'

  return (
    <BorderGlow
      as="article"
      className={`metric-card metric-card--${tier}`}
      glowColor="48 100% 54%"
    >
      <header className="metric-card__head">
        <span className="metric-card__label">{label}</span>
        {unit ? <span className="metric-card__unit">{unit}</span> : null}
      </header>
      <div className="metric-card__value-row">
        <span className="metric-card__value" key={String(value)}>
          {formatBig(value, suffix)}
        </span>
        {sparkData.length > 1 ? (
          <div className="metric-card__spark" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <YAxis hide domain={[0, 'dataMax + 5']} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={strokeColor}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
      {hint ? <p className="metric-card__hint">{hint}</p> : null}
    </BorderGlow>
  )
}

export default MetricCard
