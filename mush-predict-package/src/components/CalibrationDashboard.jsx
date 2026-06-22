import { useState, useEffect } from 'react'
import {
  Activity, Target, Trash2, Check, X, AlertCircle, Trophy, Pause
} from 'lucide-react'
import {
  getAllPredictions,
  recordOutcome,
  deletePrediction,
  computeCalibration,
  competitorScorecard,
  clearAllPredictions,
} from '../engine/accuracyTracker'

/**
 * CalibrationDashboard
 *
 * The "accuracy tracking" view. Lets the user:
 *   - See every prediction the engine has ever made
 *   - Mark outcomes (won / lost / no-pursue) as deals close
 *   - View calibration bucket chart (predicted % vs actual %)
 *   - View per-competitor accuracy scorecard
 *   - Track Brier score over time
 */
export default function CalibrationDashboard() {
  const [predictions, setPredictions] = useState([])
  const [filter, setFilter]           = useState('all')   // 'all' | 'pending' | 'graded'
  const [refresh, setRefresh]         = useState(0)

  useEffect(() => {
    setPredictions(getAllPredictions())
  }, [refresh])

  function bump() { setRefresh(r => r + 1) }

  function markOutcome(id, outcome) {
    recordOutcome(id, outcome)
    bump()
  }

  function remove(id) {
    deletePrediction(id)
    bump()
  }

  function nuke() {
    if (confirm('Delete ALL logged predictions and outcomes? This cannot be undone.')) {
      clearAllPredictions()
      bump()
    }
  }

  const calibration = computeCalibration('predictedWin')
  const scorecard   = competitorScorecard()

  const filtered = predictions.filter(p =>
    filter === 'all' ? true :
    filter === 'pending' ? p.outcome === null :
    p.outcome !== null
  )

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg flex items-center gap-2">
          <Target size={16} className="text-mk-lblue" />
          Prediction accuracy
        </h2>
        <p className="text-white/40 text-sm mt-0.5">
          Every prediction is logged when made. As outcomes come in, mark won/lost to build calibration data.
          A well-calibrated model has predicted % ≈ actual % in every bucket.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Total predictions"    value={calibration.totalPredictions ?? predictions.length} />
        <Stat label="Awaiting outcome"     value={calibration.awaitingOutcome  ?? predictions.length} color="text-mk-gold"   />
        <Stat label="Graded predictions"   value={calibration.totalWithOutcomes ?? 0}                color="text-mk-lgreen" />
        <Stat label="Brier score"          value={calibration.overallBrier ?? '—'} sublabel="lower is better · 0 = perfect" />
      </div>

      {/* Calibration buckets */}
      {calibration.totalWithOutcomes > 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 mb-5">
          <h4 className="font-barlow font-semibold text-white text-sm mb-3 flex items-center gap-2">
            <Activity size={13} className="text-mk-lblue" />
            Calibration curve
          </h4>
          <p className="text-white/40 text-xs mb-4">
            Each bucket shows the average predicted win % vs the actual win rate observed.
            A perfectly calibrated model has both bars equal in every bucket.
          </p>

          <div className="space-y-2.5">
            {calibration.buckets.map(b => (
              <div key={b.rangeLabel}>
                <div className="flex items-center justify-between text-[11px] font-mono text-white/40 mb-1">
                  <span>Bucket: {b.rangeLabel}</span>
                  <span>{b.count} predictions{b.predicted !== null ? ` · pred ${(b.predicted * 100).toFixed(0)}% vs actual ${(b.actual * 100).toFixed(0)}%` : ''}</span>
                </div>
                <div className="flex gap-1 items-center">
                  <div className="flex-1 h-3 bg-white/5 rounded-sm overflow-hidden">
                    {b.predicted !== null && (
                      <div className="h-full bg-mk-lblue/50 transition-all" style={{ width: `${b.predicted * 100}%` }} />
                    )}
                  </div>
                </div>
                <div className="flex gap-1 items-center mt-1">
                  <div className="flex-1 h-3 bg-white/5 rounded-sm overflow-hidden">
                    {b.actual !== null && (
                      <div className="h-full bg-mk-lgreen/60 transition-all" style={{ width: `${b.actual * 100}%` }} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-4 text-[10px] font-mono uppercase tracking-wider text-white/40">
            <span className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-mk-lblue/50"/> Predicted</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-mk-lgreen/60"/> Actual</span>
          </div>
        </div>
      ) : (
        <div className="bg-mk-lblue/8 border border-mk-lblue/20 rounded-xl p-5 mb-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-mk-lblue flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-barlow font-medium text-white text-sm">No graded outcomes yet</p>
              <p className="text-white/55 text-xs mt-1 leading-relaxed">
                Run predictions in the RFP Scorer — they'll automatically log here. As real deals close, mark them won/lost below. Calibration math kicks in once you have ~10 graded predictions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Competitor scorecard */}
      {scorecard.length > 0 && (
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 mb-5">
          <h4 className="font-barlow font-semibold text-white text-sm mb-3 flex items-center gap-2">
            <Trophy size={13} className="text-mk-gold" />
            Per-competitor calibration
          </h4>
          <div className="space-y-1.5">
            {scorecard.map(s => (
              <div key={s.competitor} className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-md text-xs">
                <span className="font-barlow font-medium text-white">{s.competitor}</span>
                <span className="font-mono text-white/55">
                  predicted <span className="text-mk-lblue">{(s.avgPredicted * 100).toFixed(0)}%</span>
                  &nbsp;vs actual <span className="text-mk-lgreen">{(s.actualWinRate * 100).toFixed(0)}%</span>
                  <span className={`ml-2 ${Math.abs(s.diff) > 0.15 ? 'text-mk-orange' : 'text-white/30'}`}>
                    Δ {s.diff > 0 ? '+' : ''}{(s.diff * 100).toFixed(0)}
                  </span>
                  <span className="ml-2 text-white/30">n={s.n}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prediction log */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-barlow font-semibold text-white text-sm">Prediction log</h4>
          <div className="flex items-center gap-2">
            {['all', 'pending', 'graded'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-md border transition-all
                ${filter === f ? 'bg-mk-lblue/15 border-mk-lblue/40 text-mk-lblue' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}>
                {f}
              </button>
            ))}
            {predictions.length > 0 && (
              <button onClick={nuke} className="text-[10px] font-mono uppercase tracking-wider text-mk-orange/70 hover:text-mk-orange ml-2">Clear all</button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-white/30 font-barlow text-sm">No predictions match this filter.</div>
        ) : (
          <div className="bg-white/[0.03] border border-white/8 rounded-xl divide-y divide-white/5">
            {filtered.slice(0, 50).map(p => (
              <div key={p.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <span className="font-barlow font-semibold text-white text-sm">{p.competitor}</span>
                      <span className="text-[10px] font-mono text-white/30">on</span>
                      <span className="font-barlow text-white/75 text-sm truncate">{p.opportunity.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-white/40 flex-wrap">
                      <span>pursue <span className="text-mk-lblue">{(p.predictedPursue * 100).toFixed(0)}%</span></span>
                      <span>win <span className="text-mk-lblue">{(p.predictedWin * 100).toFixed(0)}%</span></span>
                      <span className="text-white/25">{p.recordedAt.slice(0, 10)}</span>
                      <span className="text-white/25">{p.opportunity.state} · {p.opportunity.segment}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {p.outcome === null ? (
                      <>
                        <OutcomeBtn icon={<Check size={11} />}  label="won"       onClick={() => markOutcome(p.id, 'won')}       color="mk-lgreen" />
                        <OutcomeBtn icon={<X size={11} />}      label="lost"      onClick={() => markOutcome(p.id, 'lost')}      color="mk-orange" />
                        <OutcomeBtn icon={<Pause size={11} />}  label="no-pursue" onClick={() => markOutcome(p.id, 'no-pursue')} color="mk-silver" />
                      </>
                    ) : (
                      <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-md border ${
                        p.outcome === 'won'  ? 'bg-mk-lgreen/12 text-mk-lgreen border-mk-lgreen/25' :
                        p.outcome === 'lost' ? 'bg-mk-orange/12 text-mk-orange border-mk-orange/25' :
                                                'bg-white/5 text-white/40 border-white/10'
                      }`}>
                        {p.outcome}
                      </span>
                    )}
                    <button onClick={() => remove(p.id)} className="w-7 h-7 rounded flex items-center justify-center text-white/20 hover:text-mk-orange opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sublabel, color }) {
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <div className={`font-barlow font-bold text-2xl leading-none ${color || 'text-white'}`}>{value}</div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-white/35 mt-2">{label}</div>
      {sublabel && <div className="text-[10px] text-white/25 mt-0.5">{sublabel}</div>}
    </div>
  )
}

function OutcomeBtn({ icon, label, onClick, color }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 text-[10px] font-mono uppercase tracking-wider text-white/45 hover:text-${color} hover:bg-${color}/10 hover:border-${color}/30 transition-all`}>
      {icon} {label}
    </button>
  )
}
