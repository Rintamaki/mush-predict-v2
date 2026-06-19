import { useState } from 'react'
import { STATE_CENTROIDS, KEY_STATES, aggregateSignalsByState } from './usStates'

const VIEWBOX_W = 960
const VIEWBOX_H = 600

export default function UsHeatMap({ competitor }) {
  const [hovered, setHovered] = useState(null)
  const byState = aggregateSignalsByState(competitor)

  const stateEntries = Object.entries(byState)
  const maxTotal = Math.max(1, ...stateEntries.map(([, d]) => d.total))

  // Find the dominant signal type across all states (for color decision)
  // Bubble color: orange for contracts-heavy, blue for hiring-heavy, gold for mixed
  function bubbleColor(d) {
    if (d.contracts > d.jobs) return '#C15A2D'  // orange — winning work
    if (d.jobs > d.contracts) return '#569BB4'  // blue — building presence
    return '#D7944B'                            // gold — mixed
  }

  function radius(total) {
    // Scale: min 4, max 30
    const ratio = total / maxTotal
    return 4 + Math.sqrt(ratio) * 26
  }

  const hoveredData = hovered ? byState[hovered] : null
  const hoveredCoord = hovered ? STATE_CENTROIDS[hovered] : null

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-barlow font-semibold text-white text-sm">Geographic footprint</h4>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-mk-orange"/> Contracts</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-mk-lblue"/> Hiring</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-mk-gold"/> Mixed</span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="w-full h-auto"
          style={{ maxHeight: '380px' }}
        >
          {/* Background US silhouette — soft fill so the map reads even with no signals */}
          <rect x="0" y="0" width={VIEWBOX_W} height={VIEWBOX_H} fill="transparent" />

          {/* All state centroids as faint dots for orientation */}
          {Object.entries(STATE_CENTROIDS).map(([code, c]) => {
            const isKey   = KEY_STATES.includes(code)
            const hasData = !!byState[code]
            return (
              <g key={'bg-' + code}>
                {/* Background dot for every state */}
                <circle
                  cx={c.x} cy={c.y} r={4}
                  fill={isKey ? '#005776' : '#ffffff'}
                  fillOpacity={isKey ? 0.35 : 0.06}
                  stroke={isKey ? '#569BB4' : 'none'}
                  strokeWidth={isKey ? 1 : 0}
                  strokeOpacity={0.6}
                />
                {/* State code label (small, faded — gives users a reference) */}
                <text
                  x={c.x} y={c.y + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fill={isKey ? '#569BB4' : '#ffffff'}
                  fillOpacity={isKey ? 0.6 : (hasData ? 0.4 : 0.12)}
                >
                  {code}
                </text>
              </g>
            )
          })}

          {/* Signal bubbles — drawn on top so they're prominent */}
          {stateEntries
            .sort((a, b) => b[1].total - a[1].total)  // larger drawn first, smaller on top
            .map(([code, d]) => {
              const c = STATE_CENTROIDS[code]
              if (!c) return null
              const r       = radius(d.total)
              const color   = bubbleColor(d)
              const isHover = hovered === code
              return (
                <g key={'bubble-' + code}
                   onMouseEnter={() => setHovered(code)}
                   onMouseLeave={() => setHovered(null)}
                   style={{ cursor: 'pointer' }}>
                  <circle
                    cx={c.x} cy={c.y} r={r}
                    fill={color}
                    fillOpacity={isHover ? 0.85 : 0.55}
                    stroke={color}
                    strokeWidth={isHover ? 2 : 1}
                    style={{ transition: 'all 0.15s' }}
                  />
                </g>
              )
            })}
        </svg>

        {/* Tooltip */}
        {hoveredData && hoveredCoord && (
          <div
            className="absolute pointer-events-none bg-mk-blue border border-white/15 rounded-lg px-3 py-2 shadow-2xl z-10 min-w-[160px]"
            style={{
              left:  `${(hoveredCoord.x / VIEWBOX_W) * 100}%`,
              top:   `${(hoveredCoord.y / VIEWBOX_H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
          >
            <div className="font-barlow font-semibold text-white text-sm mb-1.5">
              {hoveredCoord.name}
              {KEY_STATES.includes(hovered) && (
                <span className="ml-1.5 text-[9px] font-mono text-mk-lblue uppercase tracking-wider">key market</span>
              )}
            </div>
            <div className="space-y-0.5 text-xs">
              {hoveredData.contracts > 0 && <Row label="Contract wins" value={hoveredData.contracts} color="text-mk-orange" />}
              {hoveredData.jobs > 0      && <Row label="Job postings" value={hoveredData.jobs} color="text-mk-lblue" />}
              {hoveredData.permits > 0   && <Row label="Permits / entities" value={hoveredData.permits} color="text-mk-gold" />}
              {hoveredData.patents > 0   && <Row label="Patents" value={hoveredData.patents} color="text-mk-lgreen" />}
            </div>
            {Object.keys(hoveredData.segments).length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-white/10">
                <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-0.5">Top segments</div>
                {Object.entries(hoveredData.segments)
                  .sort((a,b) => b[1] - a[1])
                  .slice(0, 2)
                  .map(([seg, count]) => (
                    <div key={seg} className="text-[11px] text-white/60">{seg} <span className="text-white/30">· {count}</span></div>
                  ))}
              </div>
            )}
          </div>
        )}

        {stateEntries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-white/30 text-sm font-barlow">No geographic signals yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/55">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  )
}
