/**
 * SignalMixDonut.jsx
 * Donut chart showing breakdown of signal types for a competitor.
 */

const SIGNAL_TYPES = [
  { key: 'jobPostings',          label: 'Hiring',          color: '#569BB4' },
  { key: 'contractAwards',       label: 'Contracts won',   color: '#C15A2D' },
  { key: 'activeBids',           label: 'Active bids',     color: '#D7944B' },
  { key: 'patents',              label: 'Patents',         color: '#447D29' },
  { key: 'earningsCallMentions', label: 'Earnings calls',  color: '#9ECF7C' },
  { key: 'newsArticles',         label: 'News',            color: '#005776' },
  { key: 'lobbyingActivity',     label: 'Lobbying',        color: '#793949' },
  { key: 'permitMentions',       label: 'Permits',         color: '#B6B9BF' },
]

export function SignalMixDonut({ competitor }) {
  const counts = SIGNAL_TYPES.map(t => ({
    ...t,
    count: (competitor[t.key] ?? []).length,
  })).filter(t => t.count > 0)

  const total = counts.reduce((s, t) => s + t.count, 0)

  if (total === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
        <h4 className="font-barlow font-semibold text-white text-sm mb-3">Signal mix</h4>
        <p className="text-white/30 text-sm font-barlow text-center py-6">No signals yet</p>
      </div>
    )
  }

  // Build SVG donut arcs
  const size   = 120
  const radius = 50
  const stroke = 18
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * radius

  let cumulative = 0
  const arcs = counts.map(t => {
    const fraction = t.count / total
    const arc = {
      ...t,
      fraction,
      dashArray:  `${fraction * circ} ${circ}`,
      dashOffset: -cumulative * circ,
    }
    cumulative += fraction
    return arc
  })

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <h4 className="font-barlow font-semibold text-white text-sm mb-3">Signal mix</h4>
      <div className="flex items-center gap-4">
        <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
          {arcs.map((a, i) => (
            <circle
              key={a.key}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={a.dashArray}
              strokeDashoffset={a.dashOffset}
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          ))}
          <text
            x={cx} y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(90 ${cx} ${cy})`}
            fontSize="18"
            fontWeight="600"
            fontFamily="Barlow, sans-serif"
            fill="white"
          >
            {total}
          </text>
          <text
            x={cx} y={cy + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(90 ${cx} ${cy})`}
            fontSize="8"
            fontFamily="JetBrains Mono, monospace"
            fill="white"
            fillOpacity="0.4"
            letterSpacing="0.05em"
          >
            SIGNALS
          </text>
        </svg>

        <div className="flex-1 space-y-1">
          {arcs.sort((a,b) => b.count - a.count).map(a => (
            <div key={a.key} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-sm" style={{ background: a.color }} />
              <span className="text-white/65 flex-1">{a.label}</span>
              <span className="font-mono text-white/45">{a.count}</span>
              <span className="font-mono text-white/25 text-[10px] w-10 text-right">{Math.round(a.fraction * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * SegmentFocus.jsx
 * Horizontal bars showing % of competitor's activity in each MUSH segment.
 */
export function SegmentFocus({ competitor }) {
  const SEGMENTS = [
    { name: 'Schools',    color: '#D7944B' },
    { name: 'Healthcare', color: '#C15A2D' },
    { name: 'University', color: '#9ECF7C' },
    { name: 'Municipal',  color: '#569BB4' },
  ]

  // Count signals tagged with each segment across sources
  function countForSegment(seg) {
    let count = 0
    count += (competitor.contractAwards ?? []).filter(c => c.segment === seg).length * 3
    count += (competitor.activeBids ?? []).filter(b => b.segment === seg).length * 2
    count += (competitor.jobPostings ?? []).filter(j =>
      j.segment === seg || (j.tags ?? []).includes(seg)
    ).length * 1
    count += (competitor.earningsCallMentions ?? []).filter(m => m.topic === seg).length * 2
    count += (competitor.texasContracts ?? []).filter(c => c.segment === seg).length * 3
    return count
  }

  const counts = SEGMENTS.map(s => ({ ...s, count: countForSegment(s.name) }))
  const max    = Math.max(1, ...counts.map(c => c.count))
  const total  = counts.reduce((s, c) => s + c.count, 0)

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <h4 className="font-barlow font-semibold text-white text-sm mb-3">Segment focus</h4>
      {total === 0 ? (
        <p className="text-white/30 text-sm font-barlow text-center py-6">No segment data yet</p>
      ) : (
        <div className="space-y-2.5">
          {counts.map(s => {
            const pct = total > 0 ? (s.count / total) * 100 : 0
            return (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-barlow text-white/65">{s.name}</span>
                  <span className="font-mono text-[11px] text-white/40">{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(s.count / max) * 100}%`,
                      background: s.color,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * TimelineStrip.jsx
 * Sparkline showing signal volume over the last 12 months.
 */
export function TimelineStrip({ competitor }) {
  // Bucket every signal by month
  const buckets = {}
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets[key] = 0
  }

  function bucket(dateStr) {
    if (!dateStr) return
    const d = new Date(dateStr)
    if (isNaN(d)) return
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (key in buckets) buckets[key]++
  }

  ;(competitor.contractAwards ?? []).forEach(c => bucket(c.date))
  ;(competitor.jobPostings ?? []).forEach(j => bucket(j.postedDate))
  ;(competitor.patents ?? []).forEach(p => bucket(p.date))
  ;(competitor.permitMentions ?? []).forEach(p => bucket(p.date))
  ;(competitor.newsArticles ?? []).forEach(n => bucket(n.published))

  const entries = Object.entries(buckets)
  const max     = Math.max(1, ...entries.map(([, v]) => v))
  const total   = entries.reduce((s, [, v]) => s + v, 0)

  // Detect trend by comparing first 6 vs last 6 months
  const firstHalf = entries.slice(0, 6).reduce((s, [, v]) => s + v, 0)
  const lastHalf  = entries.slice(6).reduce((s, [, v]) => s + v, 0)
  const trend     = lastHalf > firstHalf * 1.3 ? 'accelerating'
                  : lastHalf < firstHalf * 0.7 ? 'fading'
                  : 'steady'
  const trendColor = trend === 'accelerating' ? 'text-mk-orange'
                   : trend === 'fading'        ? 'text-mk-lgreen'
                   :                              'text-white/40'

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-barlow font-semibold text-white text-sm">12-month signal trend</h4>
        <span className={`text-[10px] font-mono uppercase tracking-wider ${trendColor}`}>
          {trend}
        </span>
      </div>
      <div className="flex items-end gap-1 h-16">
        {entries.map(([month, count], i) => (
          <div key={month} className="flex-1 flex flex-col items-center justify-end" title={`${month}: ${count} signals`}>
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${(count / max) * 100}%`,
                minHeight: count > 0 ? '3px' : '1px',
                background: count > 0 ? '#569BB4' : 'rgba(255,255,255,0.05)',
                opacity: 0.4 + (i / entries.length) * 0.6,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] font-mono text-white/25">
        <span>{entries[0]?.[0]?.slice(2)}</span>
        <span className="text-white/50">{total} total</span>
        <span>{entries[entries.length-1]?.[0]?.slice(2)}</span>
      </div>
    </div>
  )
}
