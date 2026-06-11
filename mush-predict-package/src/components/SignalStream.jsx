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

export default function SignalStream({ competitors }) {
  const stream = buildStream(competitors).slice(0, 30)

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg">Live signal stream</h2>
        <p className="text-white/40 text-sm mt-0.5">
          Raw events from every data source. This is what the scoring engine actually sees.
        </p>
      </div>

      <div className="bg-white/[0.03] border border-white/8 rounded-2xl divide-y divide-white/5">
        {stream.map((event, i) => {
          const meta = TYPE_META[event.type]
          const Icon = meta.icon
          const description = [
            event.title, event.agency, event.event, event.snippet, event.topic, event.name, event.location
          ].filter(Boolean).join(' · ')

          return (
            <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
              <div className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center bg-white/5 ${meta.color}`}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-white/30">{meta.label}</span>
                    <span className="font-barlow font-semibold text-white text-sm">{event.competitor}</span>
                  </div>
                  <span className="font-mono text-[10px] text-white/30 flex-shrink-0">{event.date}</span>
                </div>
                <p className="text-white/55 text-xs leading-snug truncate">{description}</p>
                {event.value && (
                  <span className="inline-block mt-1 text-[10px] font-mono text-mk-lgreen">${(event.value / 1e6).toFixed(2)}M</span>
                )}
                {event.state && !event.value && (
                  <span className="inline-block mt-0.5 text-[10px] font-mono text-white/40">{event.state}{event.segment ? ` · ${event.segment}` : ''}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
