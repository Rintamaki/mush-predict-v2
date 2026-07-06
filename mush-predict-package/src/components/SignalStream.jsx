import { useEffect, useState } from 'react'
import { Briefcase, DollarSign, FileText, Award, Building, Mic, Users, Newspaper } from 'lucide-react'

const TYPE_META = {
  contract: { icon: DollarSign, label: 'Federal contract', color: 'text-mk-lgreen' },
  bid:      { icon: FileText,   label: 'Open bid',         color: 'text-mk-lblue'  },
  job:      { icon: Briefcase,  label: 'Job posting',      color: 'text-mk-gold'   },
  exec:     { icon: Users,      label: 'Executive move',   color: 'text-mk-orange' },
  patent:   { icon: Award,      label: 'Patent filing',    color: 'text-mk-lgreen' },
  earnings: { icon: Mic,        label: 'Earnings call',    color: 'text-mk-lblue'  },
  permit:   { icon: Building,   label: 'Building permit',  color: 'text-mk-gold'   },
  news:     { icon: Newspaper,  label: 'News',             color: 'text-mk-lblue'  },
}

export default function SignalStream() {
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('./data/signals.json?t=' + Date.now())
      .then(r => r.ok ? r.json() : [])
      .then(json => setSignals(Array.isArray(json) ? json : []))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="text-white/40 text-sm p-4">Loading signals…</div>
  }

  if (!signals.length) {
    return (
      <div className="text-white/40 text-sm p-4">
        No signals yet — the daily pipeline will populate this on its next run.
      </div>
    )
  }

  // Sort newest first
  const sorted = [...signals].sort((a, b) => {
    const da = new Date(a.timestamp || 0).getTime() || 0
    const db = new Date(b.timestamp || 0).getTime() || 0
    return db - da
  })

  return (
    <div className="space-y-1">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-barlow font-semibold text-white text-lg">Signal Stream</h2>
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
          {signals.length} accumulated · showing 50 newest
        </span>
      </div>
      {sorted.slice(0, 50).map(signal => {
        const meta = TYPE_META[signal.type] || { icon: FileText, label: signal.type, color: 'text-white/50' }
        const Icon = meta.icon
        return (
          <div
            key={signal.id}
            className="px-4 py-3 bg-white/[0.02] border border-white/5 rounded-md hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-start gap-3">
              <Icon size={14} className={`${meta.color} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-barlow font-semibold text-white">
                  {signal.company}
                </div>
                <div className="text-xs text-white/65 mt-0.5">
                  {signal.title}
                </div>
                <div className="text-[10px] font-mono text-white/30 mt-1 flex items-center gap-2">
                  <span className={meta.color}>{meta.label}</span>
                  <span>·</span>
                  <span>{signal.timestamp || 'no date'}</span>
                  {signal.source && (
                    <>
                      <span>·</span>
                      <span>{signal.source}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
