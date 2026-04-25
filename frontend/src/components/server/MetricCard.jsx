import { useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'

function tierFor(value) {
  if (value === null || value === undefined || isNaN(value)) return 'muted'
  if (value >= 80) return 'hot'
  if (value >= 60) return 'warm'
  return 'cool'
}

function formatBig(value, suffix) {
  if (value === null || value === undefined || isNaN(value)) return '—'
  return `${Number(value).toFixed(1)}${suffix}`
}

export default function MetricCard({ label, value, suffix = '%', sparkline = [], unit, hint }) {
  const tier = tierFor(typeof value === 'number' ? value : null)

  const sparkData = useMemo(() => {
    if (!Array.isArray(sparkline) || sparkline.length === 0) return []
    return sparkline.filter(v => typeof v === 'number' && !isNaN(v)).slice(-5).map((v, i) => ({ i, v }))
  }, [sparkline])

  const strokeColor = tier === 'hot' ? '#fef08a' : tier === 'warm' ? '#facc15' : '#ffffff40'

  const valueColor =
    tier === 'hot'  ? 'text-red-400' :
    tier === 'warm' ? 'text-brand-yellow' :
    tier === 'muted'? 'text-white/30' :
                      'text-white'

  return (
    <article className="glow-card p-5 flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/35">{label}</span>
        {unit && <span className="text-[10px] text-white/25">{unit}</span>}
      </header>

      <div className="flex items-end justify-between gap-2">
        <span className={`text-4xl font-bold font-mono transition-colors duration-300 ${valueColor}`}>
          {formatBig(value, suffix)}
        </span>

        {sparkData.length > 1 && (
          <div className="w-20 h-10 shrink-0" aria-hidden="true">
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
        )}
      </div>

      {hint && <p className="text-white/30 text-xs">{hint}</p>}
    </article>
  )
}
