import { Briefcase, DollarSign, FileText, Award, Building, Mic, Users } from 'lucide-react'

const TYPE_META = {
  contractAwards:       { icon: DollarSign, label: 'Federal contract',   color: 'text-mk-lgreen' },
  activeBids:           { icon: FileText,   label: 'Open bid',           color: 'text-mk-lblue'  },
  jobPostings:          { icon: Briefcase,  label: 'Job posting',        color: 'text-mk-gold'   },
  executiveMoves:       { icon: Users,      label: 'Executive move',     color: 'text-mk-orange' },
  patents:              { icon: Award,      label: 'Patent filing',      color: 'text-mk-lgreen' },
  earningsCallMentions: { icon: Mic,        label: 'Earnings call',      color: 'text-mk-lblue'  },
  permitMentions:       { icon: Building,   label: 'Building permit',    color: 'text-mk-gold'   },
}

function buildStream(competitors) {
  const events = []
  competitors.forEach(c => {
    Object.entries(TYPE_META).forEach(([type, meta]) => {
      (c[type] ?? []).forEach(item => {
        const date = item.date || item.postedDate || item.quarter || ''
        events.push({
          type,
          competitor: c.name,
          date,
          ...item,
        })
      })
    })
  })
  return events.sort((a, b) => new Date(b.date || '2020-01-01') - new Date(a.date || '2020-01-01'))
}

export default function SignalStream({ signals }) {

  if (!signals || signals.length === 0) {
    return <div className="text-white p-4">No signals yet</div>
  }

  return (
    <div className="space-y-3">
      {signals.slice(0, 50).map(signal => (
        <div key={signal.id} className="p-3 border border-white/10 rounded">
          <strong>{signal.company}</strong><br />
          {signal.title}<br />
          <span className="text-white/40 text-xs">
            {signal.type} • {signal.timestamp}
          </span>
        </div>
      ))}
    </div>
  )
}
