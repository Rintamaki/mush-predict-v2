import { predictNextMove } from '../engine/scoringEngine'
import { TrendingUp, MapPin } from 'lucide-react'

const SEG_COLORS = {
  Schools:    'text-mk-gold border-mk-gold/30 bg-mk-gold/8',
  Healthcare: 'text-mk-orange border-mk-orange/30 bg-mk-orange/8',
  University: 'text-mk-lgreen border-mk-lgreen/30 bg-mk-lgreen/8',
  Municipal:  'text-mk-lblue border-mk-lblue/30 bg-mk-lblue/8',
}

export default function StrategicForecast({ competitors }) {
  const forecasts = competitors.map(c => ({
    name:  c.name,
    moves: predictNextMove(c),
    summary: c.recentSignalSummary,
  })).filter(f => f.moves.length > 0)

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg">Strategic forecast</h2>
        <p className="text-white/40 text-sm mt-0.5">
          Where signals indicate each competitor is positioning to push next.
          Higher score = stronger convergence of hiring, bidding, exec moves, and earnings call signals.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {forecasts.map(f => (
          <div key={f.name} className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-barlow font-semibold text-white text-base">{f.name}</h3>
                <p className="text-white/40 text-xs mt-0.5 leading-snug">{f.summary}</p>
              </div>
            </div>

            <div className="space-y-2">
              {f.moves.map((m, i) => (
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

            {f.moves.length === 0 && (
              <p className="text-white/30 text-xs font-barlow text-center py-4">
                Insufficient signals to forecast next move
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
