import { useState, useEffect } from 'react'
import { Sliders, RotateCcw, X } from 'lucide-react'
import { WEIGHTS, DEFAULT_WEIGHTS, setWeights, resetWeights } from '../engine/scoringEngine'

/**
 * WeightTuner
 *
 * A small floating control panel that lets the user adjust the four
 * sub-score weights and see the predictions update live.
 *
 * Mounted as a side drawer — opens via a button in the TopBar.
 * Values auto-normalize to sum to 1.0 so probabilities remain valid.
 */
export default function WeightTuner({ open, onClose, onChange }) {
  const [vals, setVals] = useState({ ...WEIGHTS })

  // Sync local state with engine weights when drawer opens
  useEffect(() => {
    if (open) setVals({ ...WEIGHTS })
  }, [open])

  function update(key, value) {
    const next = { ...vals, [key]: parseFloat(value) }
    setVals(next)
    setWeights(next)
    onChange?.()
  }

  function reset() {
    setVals({ ...DEFAULT_WEIGHTS })
    resetWeights()
    onChange?.()
  }

  if (!open) return null

  // Display normalized percentages
  const sum = vals.behavioral + vals.geographic + vals.segment + vals.strategic
  const display = sum > 0
    ? {
        behavioral: vals.behavioral / sum,
        geographic: vals.geographic / sum,
        segment:    vals.segment    / sum,
        strategic:  vals.strategic  / sum,
      }
    : vals

  const sliders = [
    { key: 'behavioral', label: 'Behavioral fit',     hint: 'Active pursuits, recent wins, bids in flight',     color: 'mk-orange'  },
    { key: 'geographic', label: 'Geographic fit',     hint: 'Office presence, state-level history, local jobs', color: 'mk-lblue'   },
    { key: 'segment',    label: 'Segment fit',        hint: 'Vertical focus, segment win rate, patents',        color: 'mk-gold'    },
    { key: 'strategic',  label: 'Strategic momentum', hint: 'Earnings calls, exec hires, lobbying activity',    color: 'mk-lgreen'  },
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 animate-fade-in" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-mk-blue border-l border-white/10 z-50 shadow-2xl overflow-y-auto animate-fade-in">
        <div className="p-5 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-mk-lblue" />
            <h3 className="font-barlow font-semibold text-white text-base">Sensitivity tuning</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X size={16} /></button>
        </div>

        <div className="p-5">
          <p className="text-white/45 text-xs leading-relaxed mb-5">
            Adjust how much each component contributes to the pursuit likelihood.
            Predictions update live. Values are automatically normalized to sum to 100%.
            Settings are saved locally so they persist across sessions.
          </p>

          <div className="space-y-5">
            {sliders.map(s => (
              <div key={s.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <div className={`font-barlow font-medium text-sm text-${s.color}`}>{s.label}</div>
                    <div className="text-[11px] text-white/35 mt-0.5">{s.hint}</div>
                  </div>
                  <div className="font-mono text-white/75 text-sm tabular-nums">
                    {(display[s.key] * 100).toFixed(0)}%
                  </div>
                </div>
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={vals[s.key]}
                  onChange={e => update(s.key, e.target.value)}
                  className={`w-full accent-${s.color}`}
                />
              </div>
            ))}
          </div>

          <div className="mt-7 pt-4 border-t border-white/8 flex items-center justify-between">
            <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-[11px] font-mono uppercase tracking-wider text-white/55 hover:text-white/85 transition-colors">
              <RotateCcw size={11} /> Reset to defaults
            </button>
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">
              Defaults: 40 / 20 / 25 / 15
            </div>
          </div>

          <div className="mt-6 bg-mk-lblue/5 border border-mk-lblue/20 rounded-lg p-3">
            <p className="text-white/55 text-xs leading-relaxed">
              <strong className="text-mk-lblue">Why this exists:</strong> Sensitivity analysis lets you prove the model isn't relying on any single signal type. If a prediction changes dramatically when one weight moves, that signal is dominant and worth investigating.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
