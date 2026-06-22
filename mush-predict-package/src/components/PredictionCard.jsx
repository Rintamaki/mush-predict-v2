import CalculationTrace from './CalculationTrace'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import ProbabilityRing from './ProbabilityRing'

const SUB_COLORS = {
  behavioral: 'border-mk-orange/30 bg-mk-orange/8 text-mk-orange',
  geographic: 'border-mk-lblue/30 bg-mk-lblue/8 text-mk-lblue',
  segment:    'border-mk-gold/30 bg-mk-gold/8 text-mk-gold',
  strategic:  'border-mk-lgreen/30 bg-mk-lgreen/8 text-mk-lgreen',
}

export default function PredictionCard({ prediction, isLeader, rank }) {
  const [expanded, setExpanded] = useState(false)
  const { competitor, pursuitLikelihood, winLikelihood, confidence, historicalWinRate, subScores, allSignals } = prediction

  return (
    <div className={`relative bg-white/[0.03] border ${isLeader ? 'border-mk-lblue/40 shadow-lg shadow-mk-lblue/10' : 'border-white/8'} rounded-2xl overflow-hidden animate-slide-up`}>
      {isLeader && (
        <div className="absolute -top-px left-6 px-2.5 py-1 bg-mk-lblue text-mk-blue text-[10px] font-mono uppercase tracking-widest font-semibold rounded-b">
          <Trophy size={10} className="inline -mt-0.5 mr-1" />Most likely
        </div>
      )}

      {/* Main row */}
      <div className="px-6 pt-7 pb-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/30">#{rank}</span>
              <h3 className="font-barlow font-semibold text-white text-lg">{competitor}</h3>
            </div>
            <p className="text-white/45 text-xs font-mono mb-3">Historical {(historicalWinRate * 100).toFixed(0)}% win rate · Confidence {(confidence * 100).toFixed(0)}%</p>

            {/* Sub-score bars */}
            <div className="grid grid-cols-4 gap-1.5">
              {Object.entries(subScores).map(([key, sub]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-white/35">{sub.label}</span>
                    <span className="text-[10px] font-mono text-white/55">{Math.round(sub.score * 100)}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${SUB_COLORS[key].split(' ').find(c => c.startsWith('bg-')).replace('/8', '')}`}
                      style={{ width: `${sub.score * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Probability rings */}
          <div className="flex items-center gap-6 flex-shrink-0">
            <ProbabilityRing value={pursuitLikelihood} size={72} label="Pursue" />
            <ProbabilityRing value={winLikelihood}     size={88} label="Win" />
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 px-6 py-2 border-t border-white/5 hover:bg-white/[0.02] text-[11px] font-mono uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'Hide' : 'Show'} {allSignals.length} signal{allSignals.length === 1 ? '' : 's'} driving this prediction
      </button>

      {/* Expanded signals panel */}
      {expanded && (
        <div className="px-6 py-5 border-t border-white/5 bg-mk-blue/40 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {allSignals.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-white/30 text-sm font-barlow">
                No signals matched this opportunity profile.<br />
                <span className="text-xs">Prediction relies on default baselines.</span>
              </div>
            ) : (
              allSignals.map((sig, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/8 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${SUB_COLORS[sig.category.toLowerCase()] || 'border-white/10 text-white/40'}`}>
                      {sig.category}
                    </span>
                    <span className="text-[10px] font-mono text-mk-lgreen">+{(sig.contribution * 100).toFixed(0)}</span>
                  </div>
                  <div className="text-[13px] font-barlow font-medium text-white leading-snug mb-0.5">{sig.label}</div>
                  {sig.detail && <div className="text-[11px] text-white/45 leading-snug mb-1.5">{sig.detail}</div>}
                  <div className="text-[10px] font-mono text-white/30">→ {sig.source}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      ```javascript
<CalculationTrace prediction={prediction} />
```
    </div>
  )
}
