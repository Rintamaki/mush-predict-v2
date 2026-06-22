import { Shield, AlertTriangle, RefreshCcw } from 'lucide-react'
import { computeIncumbencies } from '../engine/incumbency'

export default function IncumbencyPanel({ competitor }) {
  const { strongIncumbencies, renewalsLikelyComing, allRepeats } = computeIncumbencies(competitor)

  if (!allRepeats?.length) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
        <h4 className="font-barlow font-semibold text-white text-sm mb-2 flex items-center gap-2">
          <Shield size={13} className="text-white/40" />
          Incumbency profile
        </h4>
        <p className="text-white/30 text-sm font-barlow text-center py-4">
          No repeat-client patterns detected
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-barlow font-semibold text-white text-sm flex items-center gap-2">
          <Shield size={13} className="text-mk-lblue" />
          Incumbency profile
        </h4>
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
          {allRepeats.length} repeat client{allRepeats.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Strong incumbents — entrenched accounts */}
      {strongIncumbencies.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-mk-orange mb-1.5 flex items-center gap-1">
            <AlertTriangle size={10} />
            Hard to displace
          </div>
          <div className="space-y-1.5">
            {strongIncumbencies.slice(0, 4).map(inc => (
              <IncumbencyRow key={inc.key} inc={inc} tone="orange" />
            ))}
          </div>
        </div>
      )}

      {/* Renewals likely coming — opportunity windows */}
      {renewalsLikelyComing.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-mk-lgreen mb-1.5 flex items-center gap-1">
            <RefreshCcw size={10} />
            Renewal window open
          </div>
          <div className="space-y-1.5">
            {renewalsLikelyComing.slice(0, 4).map(inc => (
              <IncumbencyRow key={inc.key} inc={inc} tone="green" />
            ))}
          </div>
        </div>
      )}

      {strongIncumbencies.length === 0 && renewalsLikelyComing.length === 0 && (
        <div className="space-y-1.5">
          {allRepeats.slice(0, 4).map(inc => (
            <IncumbencyRow key={inc.key} inc={inc} tone="neutral" />
          ))}
        </div>
      )}
    </div>
  )
}

function IncumbencyRow({ inc, tone }) {
  const toneClasses = {
    orange:  'border-mk-orange/30 bg-mk-orange/5',
    green:   'border-mk-lgreen/30 bg-mk-lgreen/5',
    neutral: 'border-white/8 bg-white/[0.02]',
  }[tone]

  return (
    <div className={`flex items-center justify-between p-2 border rounded-lg ${toneClasses}`}>
      <div className="flex-1 min-w-0 pr-2">
        <div className="font-barlow font-medium text-white text-xs truncate">
          {inc.agency}
        </div>
        <div className="text-[10px] font-mono text-white/40 mt-0.5">
          {inc.state} · {inc.segment}
          {inc.totalValue > 0 && ` · $${(inc.totalValue / 1e6).toFixed(1)}M total`}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="font-barlow font-bold text-white text-xs">
          {inc.awardCount}×
        </div>
        <div className="text-[9px] font-mono text-white/35 mt-0.5">
          last {inc.monthsSinceLast}mo
        </div>
      </div>
    </div>
  )
}
