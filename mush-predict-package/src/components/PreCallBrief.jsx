import { useState } from 'react'
import {
  Briefcase, Copy, Sparkles, AlertTriangle, MessageSquare,
  Target, Users, TrendingUp, MapPin, ClipboardList, Loader2
} from 'lucide-react'
import { generateBrief, formatBriefAsText } from '../engine/briefGenerator'

const SEGMENTS = ['Schools', 'Healthcare', 'University', 'Municipal']

export default function PreCallBrief({ competitors, signals, rfpRecords }) {
  const [form, setForm] = useState({
    agency: '',
    state: 'TX',
    segment: 'Schools',
    value: '',
    rfpTitle: '',
    myRole: '',
    meetingPurpose: '',
  })
  const [brief, setBrief] = useState(null)
  const [generating, setGenerating] = useState(false)

  function handleGenerate() {
    if (!form.agency) return
    setGenerating(true)

    // Small delay so the loading state is visible — makes it feel less mechanical
    setTimeout(() => {
      const opportunity = {
        title:   form.rfpTitle || `${form.agency} opportunity`,
        agency:  form.agency,
        state:   form.state.toUpperCase(),
        segment: form.segment,
        value:   parseFloat(form.value) || 0,
        keywords: [],
      }
      const meetingContext = {
        rfpTitle:       form.rfpTitle,
        myRole:         form.myRole,
        meetingPurpose: form.meetingPurpose,
      }
      const result = generateBrief({
        opportunity, meetingContext, competitors, signals, rfpHistory: rfpRecords,
      })
      setBrief(result)
      setGenerating(false)
    }, 400)
  }

  function copyBrief() {
    if (!brief) return
    navigator.clipboard.writeText(formatBriefAsText(brief)).catch(() => {})
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg flex items-center gap-2">
          <Briefcase size={16} className="text-mk-lblue" />
          Pre-call brief
        </h2>
        <p className="text-white/40 text-sm mt-0.5">
          Generate a briefing document from all available data — competitor scoring, incumbency, recent signals, and district context. Use before any customer meeting.
        </p>
      </div>

      {/* Input form */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Agency / Account *</label>
            <input type="text" value={form.agency} onChange={e => setForm({ ...form, agency: e.target.value })}
              placeholder="e.g. Plano ISD, UT Austin, Memorial Hermann"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">State</label>
            <input type="text" maxLength={2} value={form.state}
              onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white uppercase focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Est. Value (optional)</label>
            <input type="text" value={form.value}
              onChange={e => setForm({ ...form, value: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="4000000"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Segment</label>
            <div className="flex gap-1.5">
              {SEGMENTS.map(s => (
                <button key={s} onClick={() => setForm({ ...form, segment: s })}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-barlow font-medium border transition-all
                    ${form.segment === s ? 'bg-mk-lblue/15 border-mk-lblue/40 text-mk-lblue' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">RFP or opportunity title (optional)</label>
            <input type="text" value={form.rfpTitle}
              onChange={e => setForm({ ...form, rfpTitle: e.target.value })}
              placeholder="e.g. District-wide HVAC modernization ESPC"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Meeting purpose</label>
            <input type="text" value={form.meetingPurpose}
              onChange={e => setForm({ ...form, meetingPurpose: e.target.value })}
              placeholder="e.g. Discovery call with facilities director"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>
        </div>

        <button onClick={handleGenerate}
          disabled={!form.agency || generating}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-mk-lblue text-mk-blue font-barlow font-semibold text-sm rounded-lg hover:bg-mk-lblue/85 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-mk-lblue/20">
          {generating ? <><Loader2 size={14} className="animate-spin" /> Generating brief…</> : <><Sparkles size={14} /> Generate brief</>}
        </button>
      </div>

      {/* Generated brief */}
      {brief && <BriefDisplay brief={brief} onCopy={copyBrief} />}
    </div>
  )
}

// ── Brief display component — shared with the QuickBrief modal ────────────────
export function BriefDisplay({ brief, onCopy }) {
  return (
    <div className="animate-fade-in bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/8 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-mk-lblue mb-1">Pre-call brief</div>
          <h3 className="font-barlow font-bold text-white text-lg leading-tight">{brief.opportunity.agency}</h3>
          <p className="text-white/50 text-xs mt-1">
            {brief.opportunity.state} · {brief.opportunity.segment}
            {brief.opportunity.value ? ` · $${(brief.opportunity.value / 1e6).toFixed(1)}M` : ''}
            {brief.meetingContext?.meetingPurpose ? ` · ${brief.meetingContext.meetingPurpose}` : ''}
          </p>
        </div>
        <button onClick={onCopy} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-xs font-mono text-white/60 hover:text-white transition-colors flex-shrink-0">
          <Copy size={11} /> Copy brief
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Talking points */}
        {brief.talkingPoints.length > 0 && (
          <Section icon={<Target size={13} className="text-mk-lgreen" />} title="Talking points">
            <div className="space-y-2.5">
              {brief.talkingPoints.map((p, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/8 rounded-lg p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-mk-lgreen mb-1">{p.category}</div>
                  <div className="text-sm text-white/85 leading-relaxed">{p.point}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Watch-outs */}
        {brief.watchOuts.length > 0 && (
          <Section icon={<AlertTriangle size={13} className="text-mk-orange" />} title="Watch-outs">
            <div className="space-y-2">
              {brief.watchOuts.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-white/75 bg-mk-orange/5 border border-mk-orange/20 rounded-lg p-3">
                  <AlertTriangle size={12} className="text-mk-orange flex-shrink-0 mt-1" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Questions to ask */}
        {brief.questions.length > 0 && (
          <Section icon={<MessageSquare size={13} className="text-mk-lblue" />} title="Questions to ask">
            <ol className="space-y-1.5 list-none">
              {brief.questions.map((q, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-white/75">
                  <span className="text-mk-lblue font-mono text-[11px] mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Likely competitors */}
        {brief.topCompetitors.length > 0 && (
          <Section icon={<Users size={13} className="text-mk-gold" />} title="Likely competitors">
            <div className="space-y-1.5">
              {brief.topCompetitors.map((c, i) => (
                <div key={c.competitor} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/40">#{i + 1}</span>
                    <span className="font-barlow font-medium text-white text-sm">{c.competitor}</span>
                  </div>
                  <span className="text-xs font-mono text-mk-lblue">{(c.winLikelihood * 100).toFixed(0)}% win likelihood</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Incumbency at this agency */}
        {brief.incumbents.length > 0 && (
          <Section icon={<TrendingUp size={13} className="text-mk-orange" />} title="Incumbency at this account">
            <div className="space-y-1.5">
              {brief.incumbents.map(inc => (
                <div key={inc.competitor} className={`flex items-center justify-between border rounded-md px-3 py-2 ${inc.renewalWindow ? 'bg-mk-lgreen/5 border-mk-lgreen/25' : 'bg-mk-orange/5 border-mk-orange/25'}`}>
                  <div>
                    <div className="font-barlow font-medium text-white text-sm">{inc.competitor}</div>
                    <div className="text-[11px] font-mono text-white/40 mt-0.5">
                      {inc.awardCount} prior wins · ${(inc.totalValue / 1e6).toFixed(1)}M total · last {inc.monthsSinceLast}mo ago
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${inc.renewalWindow ? 'text-mk-lgreen' : 'text-mk-orange'}`}>
                    {inc.renewalWindow ? 'renewal window' : 'entrenched'}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* McKinstry history at this account */}
        {brief.mckinstryHistory && (
          <Section icon={<ClipboardList size={13} className="text-mk-lgreen" />} title="McKinstry's history here">
            <div className="bg-mk-lblue/5 border border-mk-lblue/20 rounded-lg p-3 text-sm text-white/80">
              {brief.mckinstryHistory.total} prior pursuit{brief.mckinstryHistory.total > 1 ? 's' : ''} at this account · {brief.mckinstryHistory.wins} won, {brief.mckinstryHistory.losses} lost
              {brief.mckinstryHistory.winRate > 0 && ` · win rate ${(brief.mckinstryHistory.winRate * 100).toFixed(0)}%`}
            </div>
          </Section>
        )}

        {/* Recent signals */}
        {brief.relevantSignals.length > 0 && (
          <Section icon={<MapPin size={13} className="text-mk-lblue" />} title="Recent activity in this market">
            <div className="space-y-1">
              {brief.relevantSignals.map(s => (
                <div key={s.id} className="text-xs bg-white/[0.02] border border-white/5 rounded-md px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-barlow font-medium text-white/85 truncate">{s.company}</span>
                    <span className="text-[10px] font-mono text-white/30">{s.timestamp?.slice(0, 10) || 'recent'}</span>
                  </div>
                  <div className="text-white/50 mt-0.5 truncate">{s.title}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ icon, title, children }) {
  return (
    <div>
      <h4 className="font-barlow font-semibold text-white text-sm mb-2.5 flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  )
}
