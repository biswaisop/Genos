import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'

const PALETTE = {
  cpu: '#facc15',
  memory: '#e5e5e5',
  disk: '#fafafa',
}

function tooltipStyle() {
  return {
    background: '#0a0a0a',
    border: '1px solid rgba(250, 204, 21, 0.35)',
    borderRadius: 8,
    color: '#fafafa',
    fontSize: 12,
    padding: '8px 10px',
  }
}

function gridStroke() {
  return 'rgba(250, 204, 21, 0.08)'
}

function axisStyle() {
  return { stroke: 'rgba(250, 250, 250, 0.28)', fontSize: 11 }
}

function diskColor(percent) {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return '#737373'
  if (percent >= 85) return '#fef08a'
  if (percent >= 70) return '#facc15'
  return '#fafafa'
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
          cursor={{ stroke: 'rgba(250, 204, 21, 0.35)', strokeWidth: 1 }}
        />
        {typeof threshold === 'number' ? (
          <ReferenceLine
            y={threshold}
            stroke="#eab308"
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
          cursor={{ stroke: 'rgba(250, 204, 21, 0.35)', strokeWidth: 1 }}
        />
        {typeof threshold === 'number' ? (
          <ReferenceLine
            y={threshold}
            stroke="#eab308"
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
  const hasValue = typeof value === 'number' && !Number.isNaN(value)
  const used = hasValue ? Math.max(0, Math.min(100, value)) : 0
  const free = 100 - used
  const usedFill = diskColor(used)
  const freeFill = '#1a1a1a'

  const data = [
    { name: 'Used', value: used },
    { name: 'Free', value: free },
  ]

  return (
    <div className="vitals-radial-wrap vitals-disk-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="88%"
            startAngle={90}
            endAngle={-270}
            stroke="#050505"
            strokeWidth={3}
            paddingAngle={0.5}
            isAnimationActive={true}
            animationDuration={500}
          >
            <Cell fill={usedFill} />
            <Cell fill={freeFill} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="vitals-radial-center">
        <span className="vitals-radial-value vitals-radial-value--disk">
          {hasValue ? `${used.toFixed(1)}%` : '—'}
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
