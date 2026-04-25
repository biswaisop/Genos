import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, Legend,
} from 'recharts'

// ── Shared style helpers ──────────────────────────────────────────────────────

const PALETTE = {
  cpu:    '#facc15',
  memory: '#e5e5e5',
  disk:   '#fafafa',
}

const TOOLTIP_STYLE = {
  background: '#0a0a0a',
  border: '1px solid rgba(250, 204, 21, 0.35)',
  borderRadius: 8,
  color: '#fafafa',
  fontSize: 12,
  padding: '8px 10px',
}

const GRID_STROKE   = 'rgba(250, 204, 21, 0.08)'
const AXIS_PROPS    = { stroke: 'rgba(250, 250, 250, 0.28)', fontSize: 11 }

function diskColor(pct) {
  if (typeof pct !== 'number' || isNaN(pct)) return '#737373'
  if (pct >= 85) return '#fef08a'   // hot — light yellow
  if (pct >= 70) return '#facc15'   // warm — yellow
  return '#22c55e'                  // cool — green
}

// ── Line chart ────────────────────────────────────────────────────────────────

function LineKind({ data, dataKey, color, threshold }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="time" {...AXIS_PROPS} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} {...AXIS_PROPS} tickLine={false} axisLine={false}
               width={32} tickFormatter={v => `${v}%`} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          labelFormatter={l => `Time: ${l}`}
          formatter={v => [`${Number(v).toFixed(1)}%`, dataKey.toUpperCase()]}
          cursor={{ stroke: 'rgba(250, 204, 21, 0.35)', strokeWidth: 1 }} />
        {typeof threshold === 'number' && (
          <ReferenceLine y={threshold} stroke="#eab308" strokeDasharray="4 4" strokeWidth={1} />
        )}
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5}
          dot={false} activeDot={{ r: 4, stroke: color, strokeWidth: 2, fill: '#141126' }}
          isAnimationActive animationDuration={500} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Area chart ────────────────────────────────────────────────────────────────

function AreaKind({ data, dataKey, color, threshold }) {
  const gradId = `vitals-area-${dataKey}`
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.55} />
            <stop offset="95%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="time" {...AXIS_PROPS} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} {...AXIS_PROPS} tickLine={false} axisLine={false}
               width={32} tickFormatter={v => `${v}%`} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          labelFormatter={l => `Time: ${l}`}
          formatter={v => [`${Number(v).toFixed(1)}%`, dataKey.toUpperCase()]}
          cursor={{ stroke: 'rgba(250, 204, 21, 0.35)', strokeWidth: 1 }} />
        {typeof threshold === 'number' && (
          <ReferenceLine y={threshold} stroke="#eab308" strokeDasharray="4 4" strokeWidth={1} />
        )}
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5}
          fill={`url(#${gradId})`} isAnimationActive animationDuration={500} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Pie chart (disk) ──────────────────────────────────────────────────────────

const RADIAN = Math.PI / 180

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) {
  if (percent < 0.05) return null   // skip label if slice is too thin
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#000" textAnchor="middle" dominantBaseline="central"
          fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  )
}

function PieKind({ value }) {
  const hasValue = typeof value === 'number' && !isNaN(value)
  const used     = hasValue ? Math.max(0, Math.min(100, value)) : 0
  const free     = 100 - used
  const fill     = diskColor(used)

  const slices = [
    { name: 'Used', value: used },
    { name: 'Free', value: free },
  ]

  const sliceFills = [fill, '#1f1f1f']

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const { name, value: v } = payload[0].payload
    return (
      <div style={TOOLTIP_STYLE}>
        <span style={{ color: payload[0].payload.name === 'Used' ? fill : '#555' }}>
          ● {name}:
        </span>
        {' '}<strong>{Number(v).toFixed(1)}%</strong>
      </div>
    )
  }

  const CustomLegend = () => (
    <div className="flex items-center justify-center gap-6 mt-3">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: fill }} />
        <span className="text-xs text-white/60">Used — <strong className="text-white">{used.toFixed(1)}%</strong></span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm shrink-0 bg-[#1f1f1f] border border-white/10" />
        <span className="text-xs text-white/60">Free — <strong className="text-white">{free.toFixed(1)}%</strong></span>
      </div>
    </div>
  )

  if (!hasValue) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span className="text-white/20 text-sm">No disk data</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              startAngle={90}
              endAngle={-270}
              stroke="#111"
              strokeWidth={2}
              paddingAngle={2}
              labelLine={false}
              label={<PieLabel />}
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={sliceFills[i]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <CustomLegend />
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export default function VitalsChart({
  kind = 'line',
  data = [],
  dataKey = 'cpu_percent',
  metric = 'cpu',
  threshold,
  value,
}) {
  const color = PALETTE[metric] || PALETTE.cpu
  if (kind === 'pie')  return <PieKind value={value} />
  if (kind === 'area') return <AreaKind data={data} dataKey={dataKey} color={color} threshold={threshold} />
  return <LineKind data={data} dataKey={dataKey} color={color} threshold={threshold} />
}
