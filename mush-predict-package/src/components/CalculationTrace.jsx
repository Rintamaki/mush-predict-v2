import { useState } from 'react'
import { Calculator, ChevronDown, ChevronUp, ExternalLink, Copy } from 'lucide-react'

/**
 * CalculationTrace
 *
 * Renders the full audit trail for a single prediction. Hidden by default
 * inside a collapsible panel — only opens when explicitly clicked.
 *
 * Designed for the manager / Finn audit use case: every percentage on the
 * dashboard can be traced back to the exact arithmetic that produced it.
 */
export default function CalculationTrace({ prediction }) {
  const [open, setOpen] = useState(false)
  if (!prediction?.trace) return null
  const { trace } = prediction

  function copyAsText() {
    const lines = [
      `Audit trail — ${prediction.competitor}`,
      `Opportunity: ${trace.inputs.opportunity.title}`,
      `  ${trace.inputs.opportunity.agency} · ${trace.inputs.opportunity.state} · ${trace.inputs.opportunity.segment}`,
      '',
      'Weights:',
      `  Behavioral ${(trace.inputs.weights.behavioral * 100).toFixed(0)}%`,
      `  Geographic ${(trace.inputs.weights.geographic * 100).toFixed(0)}%`,
      `  Segment    ${(trace.inputs.weights.segment * 100).toFixed(0)}%`,
      `  Strategic  ${(trace.inputs.weights.strategic * 100).toFixed(0)}%`,
      '',
      'Sub-scores:',
      ...trace.steps.map(s =>
        `  ${s.name.padEnd(22)} ${s.rawScore.toFixed(3)} × ${(s.weight * 100).toFixed(0)}% = ${s.weighted.toFixed(3)}  (${s.signalCount} signals)`
      ),
      '',
      `Pursuit formula:  ${trace.pursuitFormula}`,
      `Win formula:      ${trace.winFormula}`,
      `Win-rate source:  ${trace.winRateSource}`,
      '',
      'Signal detail:',
      ...trace.steps.flatMap(step =>
        step.signals.map(sig => `  [${step.name}] +${(sig.contribution * 100).toFixed(0)} ${sig.label} (${sig.source})`)
      ),
    ].join('\n')
    navigator.clipboard.writeText(lines).catch(() => {})
  }

  return (
    <div className="mt-2 border-t border-white/5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/[0.02] text-[11px] font-mono uppercase tracking-wider text-white/35 hover:text-white/65 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Calculator size={11} />
          Audit · show the math
        </span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 bg-mk-blue/30 border-t border-white/5 animate-fade-in">
          {/* Inputs */}
          <div className="mb-4">
            <h5 className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">Inputs</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="bg-white/[0.03] border border-white/8 rounded-md p-2.5">
                <div className="text-white/35 text-[10px] uppercase tracking-wider mb-1">Opportunity</div>
                <div className="text-white/75 font-barlow font-medium">{trace.inputs.opportunity.title}</div>
                <div className="text-white/40 text-[11px] font-mono mt-0.5">
                  {trace.inputs.opportunity.state} · {trace.inputs.opportunity.segment}
                  {trace.inputs.opportunity.value ? ` · $${(trace.inputs.opportunity.value / 1e6).toFixed(1)}M` : ''}
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/8 rounded-md p-2.5">
                <div className="text-white/35 text-[10px] uppercase tracking-wider mb-1">Weights in play</div>
                <div className="font-mono text-[11px] text-white/60 space-y-0.5">
                  <div>Behavioral &nbsp;<span className="text-mk-lblue">{(trace.inputs.weights.behavioral * 100).toFixed(0)}%</span></div>
                  <div>Geographic&nbsp;<span className="text-mk-lblue">{(trace.inputs.weights.geographic * 100).toFixed(0)}%</span></div>
                  <div>Segment &nbsp; &nbsp;<span className="text-mk-lblue">{(trace.inputs.weights.segment    * 100).toFixed(0)}%</span></div>
                  <div>Strategic &nbsp;<span className="text-mk-lblue">{(trace.inputs.weights.strategic  * 100).toFixed(0)}%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-score breakdown */}
          <div className="mb-4">
            <h5 className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">Sub-score math</h5>
            <div className="bg-white/[0.03] border border-white/8 rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.02] text-white/40">
                  <tr>
                    <th className="text-left  px-3 py-2 font-mono uppercase tracking-wider text-[10px]">Component</th>
                    <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px]">Raw</th>
                    <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px]">×Weight</th>
                    <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px]">Weighted</th>
                    <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px]">Signals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {trace.steps.map(s => (
                    <tr key={s.name}>
                      <td className="px-3 py-2 text-white/70 font-barlow font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-right text-white/55">{s.rawScore.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right text-white/40">{(s.weight * 100).toFixed(0)}%</td>
                      <td className="px-3 py-2 text-right text-mk-lblue">{s.weighted.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right text-white/55">{s.signalCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formulas */}
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="bg-white/[0.03] border border-white/8 rounded-md p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">Pursuit formula</div>
              <code className="text-[11px] text-white/75 font-mono break-all">{trace.pursuitFormula}</code>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-md p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">Win likelihood</div>
              <code className="text-[11px] text-white/75 font-mono break-all">{trace.winFormula}</code>
              <div className="text-[10px] text-mk-lgreen mt-2">Win rate from: <span className="font-mono">{trace.winRateSource}</span></div>
            </div>
          </div>

          {/* Copy button */}
          <div className="flex justify-end">
            <button onClick={copyAsText} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-[11px] font-mono text-white/55 hover:text-white/85 transition-colors">
              <Copy size={11} /> Copy full audit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
