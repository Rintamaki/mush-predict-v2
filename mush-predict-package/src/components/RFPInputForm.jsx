import { useState } from 'react'
import { ClipboardPaste, Sparkles, ChevronDown, Upload, FileText, X, Check } from 'lucide-react'
import { extractRFP } from '../engine/rfpExtractor'

const SEGMENTS = ['Schools', 'Healthcare', 'University', 'Municipal']

const SAMPLE_RFPS = [
  {
    label: 'Plano ISD HVAC modernization (Texas, $4M)',
    data: {
      title:   'Plano ISD district-wide HVAC modernization',
      agency:  'Plano Independent School District',
      state:   'TX', segment: 'Schools', value: 4000000,
      keywords: ['HVAC','ESPC','K-12','retrofit'],
      description: 'District seeks ESPC for HVAC modernization across 72 buildings.',
    },
  },
  {
    label: 'UT Austin EaaS partnership ($25M)',
    data: {
      title:   'UT Austin energy-as-a-service campus partnership',
      agency:  'University of Texas at Austin',
      state:   'TX', segment: 'University', value: 25000000,
      keywords: ['EaaS','decarbonization','university','campus'],
      description: '15-year EaaS partnership covering main campus + research facilities.',
    },
  },
  {
    label: 'King County wastewater energy retrofit ($8M)',
    data: {
      title:   'King County wastewater treatment energy efficiency project',
      agency:  'King County, Washington',
      state:   'WA', segment: 'Municipal', value: 8000000,
      keywords: ['municipal','wastewater','energy efficiency','retrofit'],
      description: 'Energy efficiency retrofit at three wastewater treatment facilities.',
    },
  },
]

export default function RFPInputForm({ onScore }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [extracting, setExtracting]     = useState(false)
  const [extractMsg, setExtractMsg]     = useState(null)   // { mode, file } after a successful extract
  const [uploadError, setUploadError]   = useState(null)
  const [form, setForm] = useState({
    title: '', agency: '', state: 'TX', segment: 'Schools',
    value: '', keywords: '', description: '',
  })

  function loadSample(sample) {
    setExtractMsg(null)
    setForm({
      ...sample.data,
      value:    sample.data.value.toString(),
      keywords: sample.data.keywords.join(', '),
    })
  }

  // ── PDF UPLOAD → AUTO-FILL ──────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      setUploadError('Please upload a PDF file.')
      return
    }
    setUploadError(null)
    setExtracting(true)
    setExtractMsg(null)
    try {
      const extracted = await extractRFP(file, { preferAI: true })
      // Pre-fill the form from the extraction
      setForm({
        title:       extracted.title || '',
        agency:      extracted.agency || '',
        state:       (extracted.state || 'TX').toUpperCase(),
        segment:     SEGMENTS.includes(extracted.segment) ? extracted.segment : 'Schools',
        value:       extracted.value ? String(extracted.value) : '',
        keywords:    Array.isArray(extracted.keywords) ? extracted.keywords.join(', ') : '',
        description: extracted.raw ? extracted.raw.slice(0, 400) : (extracted.description || ''),
      })
      setExtractMsg({ mode: extracted.extractionMode, file: file.name })
      if (extracted.extractionMode !== 'ai') setShowAdvanced(false)
    } catch (err) {
      setUploadError('Could not read that PDF. Fill the fields in manually below.')
    } finally {
      setExtracting(false)
      e.target.value = ''
    }
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
          <p className="text-white/40 text-sm mt-0.5">Upload an RFP PDF to auto-fill, or enter the details manually.</p>
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

      {/* ── UPLOAD ZONE ── */}
      <label className="block mb-5">
        <input type="file" accept="application/pdf" onChange={handleFile} className="hidden" disabled={extracting} />
        <div className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
          ${extracting ? 'border-mk-lblue/40 bg-mk-lblue/5'
            : extractMsg ? 'border-mk-lgreen/40 bg-mk-lgreen/5'
            : 'border-white/15 hover:border-mk-lblue/40 hover:bg-white/[0.02]'}`}>
          {extracting ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-mk-lblue/30 border-t-mk-lblue rounded-full animate-spin" />
              <span className="font-barlow text-sm text-white/60">Reading the RFP…</span>
            </div>
          ) : extractMsg ? (
            <div className="flex items-center justify-center gap-2">
              <Check size={15} className="text-mk-lgreen" />
              <span className="font-barlow text-sm text-white/70">
                Pulled fields from <span className="font-mono text-white/50">{extractMsg.file}</span> — review below
              </span>
              {extractMsg.mode === 'ai' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-mk-lgreen/12 text-mk-lgreen border border-mk-lgreen/25">
                  <Sparkles size={9} /> AI
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mk-gold/12 text-mk-gold border border-mk-gold/25">
                  auto-guessed · verify
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2.5">
              <Upload size={16} className="text-mk-lblue" />
              <span className="font-barlow text-sm text-white/60">
                Drop an RFP PDF here to auto-fill the fields
              </span>
            </div>
          )}
        </div>
      </label>
      {uploadError && (
        <div className="flex items-center gap-2 text-mk-orange text-xs mb-4 -mt-2">
          <X size={13} /> {uploadError}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/25">or enter manually</span>
        <div className="flex-1 h-px bg-white/8" />
      </div>

      {/* ── MANUAL FIELDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Opportunity title *</label>
          <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Plano ISD district-wide HVAC modernization"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50 transition-colors" />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Agency / Owner</label>
          <input type="text" value={form.agency} onChange={e => setForm({ ...form, agency: e.target.value })}
            placeholder="Plano ISD"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">State *</label>
            <input type="text" maxLength={2} value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
              placeholder="TX"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white uppercase placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Est. Value</label>
            <input type="text" value={form.value} onChange={e => setForm({ ...form, value: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="4000000"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Segment *</label>
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
          <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Keywords (comma-separated)</label>
          <input type="text" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })}
            placeholder="HVAC, ESPC, K-12, retrofit"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
        </div>

        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="md:col-span-2 text-[11px] font-mono uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors text-left">
          {showAdvanced ? '— Hide' : '+ Show'} description {extractMsg ? '(extracted text)' : '(optional)'}
        </button>

        {showAdvanced && (
          <div className="md:col-span-2 animate-fade-in">
            <textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Optional: paste the full RFP description for richer scoring"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50 resize-none" />
          </div>
        )}
      </div>

      <button onClick={handleSubmit} disabled={!form.title || !form.state || !form.segment}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-mk-lblue text-mk-blue font-barlow font-semibold text-sm rounded-lg hover:bg-mk-lblue/85 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-mk-lblue/20">
        <Sparkles size={14} />
        Run prediction
      </button>
    </div>
  )
}
