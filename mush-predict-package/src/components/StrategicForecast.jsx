import { useState } from 'react'
import { predictNextMove } from '../engine/scoringEngine'
import { TrendingUp, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import CompetitorDrilldown from './CompetitorDrilldown'

const SEG_COLORS = {
  Schools:    'text-mk-gold border-mk-gold/30 bg-mk-gold/8',
  Healthcare: 'text-mk-orange border-mk-orange/30 bg-mk-orange/8',
  University: 'text-mk-lgreen border-mk-lgreen/30 bg-mk-lgreen/8',
  Municipal:  'text-mk-lblue border-mk-lblue/30 bg-mk-lblue/8',
}

export default function StrategicForecast({ competitors }) {
  const [expanded, setExpanded] = useState(null)

  const forecasts = competitors
    .map(c => ({
      name:    c.name,
      moves:   predictNextMove(c),
      summary: c.recentSignalSummary,
      raw:     c,   // pass through the full competitor object for drill-down
    }))
    .filter(f => f.moves.length > 0)

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg">Strategic forecast</h2>
        <p className="text-white/40 text-sm mt-0.5">
          Where signals indicate each competitor is positioning to push next.
          Click any competitor to see their full footprint, segment focus, and activity trend.
        </p>
      </div>

      <div className="space-y-3">
        {forecasts.map(f => {
          const isOpen = expanded === f.name
          return (
            <div key={f.name} className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
              {/* Header — always visible, click to expand */}
              <button
                onClick={() => setExpanded(isOpen ? null : f.name)}
                className="w-full text-left p-5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-barlow font-semibold text-white text-base flex items-center gap-2">
                      {f.name}
                      <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
                        {isOpen ? 'collapse' : 'expand'}
                      </span>
                    </h3>
                    <p className="text-white/40 text-xs mt-0.5 leading-snug">{f.summary}</p>
                  </div>
                  <div className="flex items-center gap-1 text-white/40 flex-shrink-0">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Top predicted moves preview */}
                <div className="space-y-2">
                  {f.moves.slice(0, isOpen ? f.moves.length : 3).map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-lg">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-1 text-white/40">
                          <MapPin size={11} />
                          <span className="font-mono text-xs">{m.state}</span>
                        </div>
                        <span className={`text-[11px] font-barlow font-medium px-2 py-0.5 rounded border ${SEG_COLORS[m.segment] || 'border-white/10'}`}>
                          {m.segment}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-mk-lblue rounded-full transition-all duration-700"
                            style={{ width: `${m.probability * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-white/60 w-10 text-right">{(m.probability * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </button>

              {/* Expanded drill-down panel */}
              {isOpen && (
                <div className="px-5 pb-5 pt-1 border-t border-white/5">
                  <CompetitorDrilldown competitor={f.raw} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {forecasts.length === 0 && (
        <div className="text-center py-16 text-white/30 font-barlow text-sm">
          No competitor forecasts yet — pipeline is still building signal history.
        </div>
      )}
    </div>
  )
}
