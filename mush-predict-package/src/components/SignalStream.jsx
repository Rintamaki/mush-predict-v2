import { useEffect, useState } from 'react'
import { Briefcase, DollarSign, FileText, Award, Building, Mic, Users } from 'lucide-react'

const TYPE_META = {
  contractAwards: { icon: DollarSign, label: 'Federal contract', color: 'text-mk-lgreen' },
  activeBids: { icon: FileText, label: 'Open bid', color: 'text-mk-lblue' },
  jobPostings: { icon: Briefcase, label: 'Job posting', color: 'text-mk-gold' },
  executiveMoves: { icon: Users, label: 'Executive move', color: 'text-mk-orange' },
  patents: { icon: Award, label: 'Patent filing', color: 'text-mk-lgreen' },
  earningsCallMentions: { icon: Mic, label: 'Earnings call', color: 'text-mk-lblue' },
  permitMentions: { icon: Building, label: 'Building permit', color: 'text-mk-gold' },
}

export default function SignalStream() {

  const [signals, setSignals] = useState([])

  useEffect(() => {
    fetch('/data/signals.json?t=' + Date.now())
      .then(r => r.json())
      .then(setSignals)
      .catch(() => setSignals([]))
  }, [])

  if (!signals || signals.length === 0) {
    return <div className="text-white/40 text-sm">No signals yet</div>
  }

  return (
    <div className="space-y-2">
      {signals.slice(0, 50).map(signal => {
        const meta = TYPE_META[signal.type + 's'] || {}

        return (
          <div
            key={signal.id}
            className="px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="text-sm font-barlow text-white">
              {signal.company}
            </div>

            <div className="text-xs text-white/60 mt-0.5">
              {signal.title}
            </div>

            <div className="text-[10px] font-mono text-white/30 mt-1">
              {signal.type} · {signal.timestamp}
            </div>
          </div>
        )
      })}
    </div>
  )
}
``