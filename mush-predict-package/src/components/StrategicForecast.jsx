import { useState, useMemo } from 'react'
import { forecastFromSignals } from '../engine/signalsForecast'
import { MapPin, ChevronDown, ChevronUp, Activity, Database, Zap } from 'lucide-react'
import CompetitorDrilldown from './CompetitorDrilldown'

const SEG_COLORS = {
  Schools:    'text-mk-gold border-mk-gold/30 bg-mk-gold/8',
  Healthcare: 'text-mk-orange border-mk-orange/30 bg-mk-orange/8',
  University: 'text-mk-lgreen border-mk-lgreen/30 bg-mk-lgreen/8',
  Municipal:  'text-mk-lblue border-mk-lblue/30 bg-mk-lblue/8',
  Other:      'text-white/40 border-white/10 bg-white/5',
}

export default function StrategicForecast({ competitors, signals }) {
  const [expanded, setExpanded] = useState(null)

  const forecasts = useMemo(
    () => forecastFromSignals(competitors, signals || []),
    [competitors, signals]
  )

  const totalSignals = (signals || []).length
  const signalDrivenCount = forecasts.filter(f => f.predictionSource === 'signals').length

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-barlow font-semibold text-white text-lg">Strategic forecast</h2>
          <p className="text-white/40 text-sm mt-0.5">
            Where signals indicate each competitor is positioning to push next. Click any competitor to see their full footprint and activity trend.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider">
          <div className="flex items-center gap-1.5 text-white/45">
            <Database size={11} />
            {totalSignals.toLocaleString()} signals in scope
          </div>
          <div className="flex items-center gap-1.5 text-mk-lgreen">
            <Activity size={11} />
            {signalDrivenCount} of {forecasts.length} signal-driven
          </div>
        </div>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-barlow font-semibold text-white text-base">
                        {f.name}
                      </h3>
                      <SourceBadge source={f.predictionSource} count={f.signalCount} />
                      <span className="text-[10px] font-mono text-white/25 uppercase tracking-wider">
                        {isOpen ? 'collapse' : 'expand'}
                      </span>
                    </div>
                    <p className="text-white/45 text-xs mt-1 leading-snug">{f.summary}</p>
                  </div>
                  <div className="flex items-center gap-1 text-white/40 flex-shrink-0">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Top predicted moves */}
                <div className="space-y-2">
                  {f.moves.slice(0, isOpen ? f.moves.length : 3).map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-lg gap-3">
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <div className="flex items-center gap-1 text-white/40">
                          <MapPin size={11} />
                          <span className="font-mono text-xs">{m.state}</span>
                        </div>
                        <span className={`text-[11px] font-barlow font-medium px-2 py-0.5 rounded border ${SEG_COLORS[m.segment] || SEG_COLORS.Other}`}>
                          {m.segment}
                        </span>
                        {m.momentum > 0.4 && (
                          <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-mk-lgreen">
                            <Zap size={9} /> momentum
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
                        <span className="text-[10px] font-mono text-white/35 hidden sm:inline">
                          {m.signalCount} signal{m.signalCount === 1 ? '' : 's'}
                          {m.recentCount > 0 && ` · ${m.recentCount} recent`}
                        </span>
                        <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden flex-shrink-0">
                          <div
                            className="h-full bg-mk-lblue rounded-full transition-all duration-700"
                            style={{ width: `${m.probability * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-white/60 w-10 text-right flex-shrink-0">{(m.probability * 100).toFixed(0)}%</span>
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
          No forecasts yet — pipeline is still building signal history.
        </div>
      )}
    </div>
  )
}

function SourceBadge({ source, count }) {
  if (source === 'signals') {
    return (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-mk-lgreen/10 border border-mk-lgreen/30 text-mk-lgreen flex items-center gap-1">
        <Activity size={8} />
        {count} signals
      </span>
    )
  }
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 flex items-center gap-1">
      <Database size={8} />
      snapshot only
    </span>
  )
}
