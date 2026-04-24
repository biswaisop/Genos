import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'

const PALETTE = {
  cpu: '#00f5ff',
  memory: '#c084fc',
  disk: '#22d3ee',
}

function tooltipStyle() {
  return {
    background: 'rgba(20, 17, 38, 0.95)',
    border: '1px solid rgba(192, 132, 252, 0.3)',
    borderRadius: 8,
    color: '#f3f4f6',
    fontSize: 12,
    padding: '8px 10px',
  }
}

function gridStroke() {
  return 'rgba(192, 132, 252, 0.08)'
}

function axisStyle() {
  return { stroke: 'rgba(243, 244, 246, 0.35)', fontSize: 11 }
}

function diskColor(percent) {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return '#9ca3af'
  if (percent >= 85) return '#ef4444'
  if (percent >= 70) return '#facc15'
  return '#22d3ee'
}

function LineKind({ data, dataKey, color, threshold }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={gridStroke()} vertical={false} />
        <XAxis dataKey="time" {...axisStyle()} tickLine={false} axisLine={false} />
        <YAxis
          domain={[0, 100]}
          {...axisStyle()}
          tickLine={false}
          axisLine={false}
          width={32}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle()}
          labelFormatter={(label) => `Time: ${label}`}
          formatter={(value) => [`${Number(value).toFixed(1)}%`, dataKey.toUpperCase()]}
          cursor={{ stroke: 'rgba(192, 132, 252, 0.35)', strokeWidth: 1 }}
        />
        {typeof threshold === 'number' ? (
          <ReferenceLine
            y={threshold}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        ) : null}
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, stroke: color, strokeWidth: 2, fill: '#141126' }}
          isAnimationActive={true}
          animationDuration={500}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function AreaKind({ data, dataKey, color, threshold }) {
  const gradientId = `vitals-area-${dataKey}`
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.55} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridStroke()} vertical={false} />
        <XAxis dataKey="time" {...axisStyle()} tickLine={false} axisLine={false} />
        <YAxis
          domain={[0, 100]}
          {...axisStyle()}
          tickLine={false}
          axisLine={false}
          width={32}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle()}
          labelFormatter={(label) => `Time: ${label}`}
          formatter={(value) => [`${Number(value).toFixed(1)}%`, dataKey.toUpperCase()]}
          cursor={{ stroke: 'rgba(192, 132, 252, 0.35)', strokeWidth: 1 }}
        />
        {typeof threshold === 'number' ? (
          <ReferenceLine
            y={threshold}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={true}
          animationDuration={500}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function RadialKind({ value }) {
  const safe = typeof value === 'number' && !Number.isNaN(value) ? value : 0
  const data = [{ name: 'used', value: safe, fill: diskColor(safe) }]
  return (
    <div className="vitals-radial-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar
            background={{ fill: 'rgba(192, 132, 252, 0.08)' }}
            dataKey="value"
            cornerRadius={10}
            isAnimationActive={true}
            animationDuration={600}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="vitals-radial-center">
        <span className="vitals-radial-value">
          {typeof value === 'number' ? `${value.toFixed(1)}%` : '—'}
        </span>
        <span className="vitals-radial-label">Disk used</span>
      </div>
    </div>
  )
}

function VitalsChart({
  kind = 'line',
  data = [],
  dataKey = 'cpu_percent',
  metric = 'cpu',
  threshold,
  value,
}) {
  const color = PALETTE[metric] || PALETTE.cpu
  if (kind === 'radial') {
    return <RadialKind value={value} />
  }
  if (kind === 'area') {
    return <AreaKind data={data} dataKey={dataKey} color={color} threshold={threshold} />
  }
  return <LineKind data={data} dataKey={dataKey} color={color} threshold={threshold} />
}

export default VitalsChart
