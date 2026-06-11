import { useState } from 'react'
import { ClipboardPaste, Sparkles, ChevronDown } from 'lucide-react'

const SEGMENTS = ['Schools', 'Healthcare', 'University', 'Municipal']

const SAMPLE_RFPS = [
  {
    label: 'Plano ISD HVAC modernization (Texas, $4M)',
    data: {
      title:   'Plano ISD district-wide HVAC modernization',
      agency:  'Plano Independent School District',
      state:   'TX',
      segment: 'Schools',
      value:   4000000,
      keywords: ['HVAC','ESPC','K-12','retrofit'],
      description: 'District seeks ESPC for HVAC modernization across 72 buildings. Performance-based contract preferred.',
    },
  },
  {
    label: 'UT Austin EaaS partnership ($25M)',
    data: {
      title:   'UT Austin energy-as-a-service campus partnership',
      agency:  'University of Texas at Austin',
      state:   'TX',
      segment: 'University',
      value:   25000000,
      keywords: ['EaaS','decarbonization','university','campus'],
      description: '15-year EaaS partnership covering main campus + research facilities.',
    },
  },
  {
    label: 'King County wastewater energy retrofit ($8M)',
    data: {
      title:   'King County wastewater treatment energy efficiency project',
      agency:  'King County, Washington',
      state:   'WA',
      segment: 'Municipal',
      value:   8000000,
      keywords: ['municipal','wastewater','energy efficiency','retrofit'],
      description: 'Energy efficiency retrofit at three wastewater treatment facilities.',
    },
  },
]

export default function RFPInputForm({ onScore }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [form, setForm] = useState({
    title:       '',
    agency:      '',
    state:       'TX',
    segment:     'Schools',
    value:       '',
    keywords:    '',
    description: '',
  })

  function loadSample(sample) {
    setForm({
      ...sample.data,
      value:    sample.data.value.toString(),
      keywords: sample.data.keywords.join(', '),
    })
  }

  function handleSubmit() {
    if (!form.title || !form.state || !form.segment) return
    onScore({
      title:       form.title,
      agency:      form.agency,
      state:       form.state.toUpperCase(),
      segment:     form.segment,
      value:       parseFloat(form.value) || 0,
      keywords:    form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      description: form.description,
    })
  }

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 mb-6 animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-barlow font-semibold text-white text-lg">Score an opportunity</h2>
          <p className="text-white/40 text-sm mt-0.5">Paste an RFP and see which competitors are most likely to pursue and win it.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-mono uppercase tracking-wider text-white/30">Quick load</label>
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white/70 transition-colors">
              <ClipboardPaste size={12} /> Sample RFP <ChevronDown size={12} />
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-mk-blue border border-white/10 rounded-lg shadow-2xl py-1 w-80 z-10">
              {SAMPLE_RFPS.map((s, i) => (
                <button key={i} onClick={() => loadSample(s)} className="w-full text-left px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Opportunity title *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Plano ISD district-wide HVAC modernization"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Agency / Owner</label>
          <input
            type="text"
            value={form.agency}
            onChange={e => setForm({ ...form, agency: e.target.value })}
            placeholder="Plano ISD"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">State *</label>
            <input
              type="text" maxLength={2}
              value={form.state}
              onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
              placeholder="TX"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white uppercase placeholder-white/20 focus:outline-none focus:border-mk-lblue/50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Est. Value</label>
            <input
              type="text"
              value={form.value}
              onChange={e => setForm({ ...form, value: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="4000000"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Segment *</label>
          <div className="flex gap-1.5">
            {SEGMENTS.map(s => (
              <button
                key={s}
                onClick={() => setForm({ ...form, segment: s })}
                className={`flex-1 px-2 py-2 rounded-lg text-xs font-barlow font-medium border transition-all
                  ${form.segment === s
                    ? 'bg-mk-lblue/15 border-mk-lblue/40 text-mk-lblue'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Keywords (comma-separated)</label>
          <input
            type="text"
            value={form.keywords}
            onChange={e => setForm({ ...form, keywords: e.target.value })}
            placeholder="HVAC, ESPC, K-12, retrofit"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50"
          />
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="md:col-span-2 text-[11px] font-mono uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors text-left"
        >
          {showAdvanced ? '— Hide' : '+ Show'} description (optional)
        </button>

        {showAdvanced && (
          <div className="md:col-span-2 animate-fade-in">
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Optional: paste the full RFP description for richer scoring"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50 resize-none"
            />
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!form.title || !form.state || !form.segment}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-mk-lblue text-mk-blue font-barlow font-semibold text-sm rounded-lg hover:bg-mk-lblue/85 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-mk-lblue/20"
      >
        <Sparkles size={14} />
        Run prediction
      </button>
    </div>
  )
}
