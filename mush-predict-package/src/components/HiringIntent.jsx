import { useMemo } from 'react'
import { Briefcase, TrendingUp, Wrench, Crown } from 'lucide-react'
import { INTENT_META, getSignalIntent } from '../engine/intentMeta'

/**
 * HiringIntent
 *
 * Shows what a competitor's recent hiring signals reveal about their intent,
 * broken down by intent type and state. Drop into the Strategic Forecast
 * drilldown and/or the Pre-Call Brief.
 *
 * Props:
 *   signals   — array of THIS competitor's signals (already filtered by company)
 *   stateFilter — optional; if set, only count jobs in this state
 *   compact   — if true, renders a tighter version for the brief
 */
export default function HiringIntent({ signals = [], stateFilter = null, compact = false }) {
  const analysis = useMemo(() => {
    const jobs = signals.filter(s => s.type === 'job')
    const scoped = stateFilter
      ? jobs.filter(j => j.state?.toUpperCase() === stateFilter.toUpperCase())
      : jobs

    // Count by intent
    const byIntent = { Pursuit: 0, Delivery: 0, Leadership: 0, Unknown: 0 }
    // Count by (intent, state) for the "where" view
    const byIntentState = {}

    scoped.forEach(j => {
      const intent = getSignalIntent(j) || 'Unknown'
      byIntent[intent] = (byIntent[intent] || 0) + 1
      const st = j.state?.toUpperCase() || '??'
      const key = `${intent}|${st}`
      byIntentState[key] = (byIntentState[key] || 0) + 1
    })

    // Top state per meaningful intent
    const topStates = {}
    for (const intent of ['Pursuit', 'Delivery', 'Leadership']) {
      const states = Object.entries(byIntentState)
        .filter(([k]) => k.startsWith(intent + '|'))
        .map(([k, n]) => ({ state: k.split('|')[1], count: n }))
        .sort((a, b) => b.count - a.count)
      if (states.length) topStates[intent] = states.slice(0, 3)
    }

    return { total: scoped.length, byIntent, topStates }
  }, [signals, stateFilter])

  if (analysis.total === 0) {
    return compact ? null : (
      <div className="text-white/30 text-xs italic p-3">No hiring signals{stateFilter ? ` in ${stateFilter}` : ''} yet.</div>
    )
  }

  const ICONS = { Pursuit: TrendingUp, Delivery: Wrench, Leadership: Crown }

  return (
    <div className={compact ? '' : 'bg-white/[0.03] border border-white/8 rounded-xl p-4'}>
      {!compact && (
        <div className="flex items-center gap-2 mb-3">
          <Briefcase size={14} className="text-mk-gold" />
          <h4 className="font-barlow font-semibold text-white text-sm">
            Hiring intent{stateFilter ? ` — ${stateFilter}` : ''}
          </h4>
          <span className="ml-auto text-[10px] font-mono text-white/35">{analysis.total} job signals</span>
        </div>
      )}

      <div className="space-y-2">
        {['Pursuit', 'Delivery', 'Leadership'].map(intent => {
          const count = analysis.byIntent[intent] || 0
          if (count === 0) return null
          const meta = INTENT_META[intent]
          const Icon = ICONS[intent]
          const states = analysis.topStates[intent] || []
          return (
            <div key={intent} className={`rounded-lg border ${meta.border} ${meta.bg} px-3 py-2`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={12} className={meta.color} />
                  <span className={`text-xs font-barlow font-semibold ${meta.color}`}>{meta.label}</span>
                  <span className="text-[10px] font-mono text-white/40">{count} hire{count === 1 ? '' : 's'}</span>
                </div>
                {states.length > 0 && (
                  <div className="text-[10px] font-mono text-white/50">
                    {states.map(s => `${s.state}(${s.count})`).join(' ')}
                  </div>
                )}
              </div>
              {!compact && (
                <div className="text-[10px] text-white/40 mt-1">{meta.meaning}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* The strategic read — one-line interpretation */}
      {!compact && <IntentReadout byIntent={analysis.byIntent} topStates={analysis.topStates} />}
    </div>
  )
}

function IntentReadout({ byIntent, topStates }) {
  const pursuit = byIntent.Pursuit || 0
  const delivery = byIntent.Delivery || 0

  let read = null
  if (pursuit >= 3 && pursuit > delivery) {
    const where = topStates.Pursuit?.[0]?.state
    read = `Heavy sales/BD hiring${where ? ` concentrated in ${where}` : ''} — they're gearing up to pursue new work, not just deliver existing contracts.`
  } else if (delivery >= 3 && delivery > pursuit) {
    const where = topStates.Delivery?.[0]?.state
    read = `Mostly delivery hiring${where ? ` in ${where}` : ''} — suggests they've recently won work and are staffing to execute, rather than chasing new deals.`
  } else if (byIntent.Leadership >= 2) {
    const where = topStates.Leadership?.[0]?.state
    read = `Notable leadership hiring${where ? ` in ${where}` : ''} — a strategic regional investment worth watching.`
  }

  if (!read) return null
  return (
    <div className="mt-3 pt-3 border-t border-white/8 text-[11px] text-white/60 leading-relaxed">
      <span className="text-white/40 font-mono uppercase tracking-wider text-[9px]">Read: </span>
      {read}
    </div>
  )
}
