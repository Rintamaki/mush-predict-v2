import { useState, useEffect } from 'react'
import {
  Upload, FileText, Check, X, Download, Search,
  Trophy, AlertCircle, Sparkles, Trash2, Edit3
} from 'lucide-react'
import { extractRFP } from '../engine/rfpExtractor'
import { searchRFPs, makeRFPId, computeWinStats } from '../engine/rfpDatabase'

const SEGMENTS = ['Schools', 'Healthcare', 'University', 'Municipal']

const KNOWN_COMPETITORS = [
  'Johnson Controls', 'Trane Technologies', 'Ameresco', 'Schneider Electric',
  'Siemens Smart Infrastructure', 'Honeywell', 'NORESCO', 'Cenergistic',
  'McKinstry', 'Bernhard', 'ABM Industries', 'Veolia', 'Constellation',
  'ENGIE Impact', 'Convergent Energy', 'Medxcel',
]

export default function RFPDatabase({ existingRecords = [], onRecordsChange }) {
  const [records, setRecords]       = useState(existingRecords)
  const [extracting, setExtracting] = useState(false)
  const [draft, setDraft]           = useState(null)   // record being reviewed before save
  const [error, setError]           = useState(null)
  const [query, setQuery]           = useState('')
  const [segFilter, setSegFilter]   = useState('')
  const [editingId, setEditingId]   = useState(null)

  useEffect(() => { setRecords(existingRecords) }, [existingRecords])

  // ── FILE UPLOAD ─────────────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }
    setError(null)
    setExtracting(true)
    try {
      const extracted = await extractRFP(file, { preferAI: true })
      setDraft({ id: makeRFPId(), ...extracted })
    } catch (err) {
      setError('Could not read that PDF. You can still add the record manually below.')
      setDraft({
        id: makeRFPId(), title: '', agency: '', state: '', segment: '',
        value: 0, winner: '', losingBidders: [], awardDate: '',
        sourceFile: file.name, extractionMode: 'manual', confidence: 'low',
      })
    } finally {
      setExtracting(false)
      e.target.value = ''  // reset so same file can be re-uploaded
    }
  }

  // ── SAVE / DELETE ───────────────────────────────────────────────────────────
  function saveDraft() {
    if (!draft.title || !draft.segment) {
      setError('Title and segment are required.')
      return
    }
    const updated = editingId
      ? records.map(r => r.id === editingId ? draft : r)
      : [draft, ...records]
    setRecords(updated)
    onRecordsChange?.(updated)
    setDraft(null)
    setEditingId(null)
    setError(null)
  }

  function deleteRecord(id) {
    const updated = records.filter(r => r.id !== id)
    setRecords(updated)
    onRecordsChange?.(updated)
  }

  function editRecord(rec) {
    setDraft({ ...rec })
    setEditingId(rec.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── EXPORT ──────────────────────────────────────────────────────────────────
  function exportJSON() {
    const payload = {
      last_updated: new Date().toISOString().slice(0, 10),
      record_count: records.length,
      rfps: records,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rfp_history.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = searchRFPs(records, { query, segment: segFilter })
  const stats = computeWinStats(records)
  const topWinners = Object.entries(stats)
    .filter(([, s]) => s.wins > 0)
    .sort((a, b) => b[1].wins - a[1].wins)
    .slice(0, 5)

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg">RFP Outcome Database</h2>
        <p className="text-white/40 text-sm mt-0.5">
          Upload past RFP and award documents. The system extracts who won, the value, and the segment —
          then feeds real win rates into the prediction engine.
        </p>
      </div>

      {/* ── UPLOAD ZONE ── */}
      {!draft && (
        <div className="mb-6">
          <label className="block">
            <input type="file" accept="application/pdf" onChange={handleFile} className="hidden" disabled={extracting} />
            <div className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
              ${extracting ? 'border-mk-lblue/40 bg-mk-lblue/5' : 'border-white/15 hover:border-mk-lblue/40 hover:bg-white/[0.02]'}`}>
              {extracting ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-mk-lblue/30 border-t-mk-lblue rounded-full animate-spin" />
                  <p className="font-barlow text-sm text-white/60">Reading document…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-mk-lblue/10 flex items-center justify-center">
                    <Upload size={20} className="text-mk-lblue" />
                  </div>
                  <p className="font-barlow font-medium text-white text-sm">Upload an RFP or award document (PDF)</p>
                  <p className="text-white/35 text-xs">The system will try to auto-extract the key fields for your review</p>
                </div>
              )}
            </div>
          </label>
          {error && (
            <div className="mt-3 flex items-center gap-2 text-mk-orange text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>
      )}

      {/* ── REVIEW DRAFT ── */}
      {draft && (
        <div className="mb-6 bg-white/[0.03] border border-mk-lblue/30 rounded-2xl p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-barlow font-semibold text-white text-base">
                {editingId ? 'Edit record' : 'Review extracted data'}
              </h3>
              {draft.extractionMode === 'ai' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-mk-lgreen/12 text-mk-lgreen border border-mk-lgreen/25">
                  <Sparkles size={9} /> AI extracted
                </span>
              )}
              {draft.extractionMode === 'free' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-mk-gold/12 text-mk-gold border border-mk-gold/25">
                  Auto-guessed · verify fields
                </span>
              )}
            </div>
            <button onClick={() => { setDraft(null); setEditingId(null) }} className="text-white/30 hover:text-white/60">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Title *" value={draft.title} onChange={v => setDraft({ ...draft, title: v })} placeholder="Plano ISD HVAC modernization" full />
            <Field label="Agency / Owner" value={draft.agency} onChange={v => setDraft({ ...draft, agency: v })} placeholder="Plano ISD" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="State" value={draft.state} onChange={v => setDraft({ ...draft, state: v.toUpperCase() })} placeholder="TX" maxLength={2} />
              <Field label="Value ($)" value={draft.value || ''} onChange={v => setDraft({ ...draft, value: parseFloat(v.replace(/[^0-9]/g,'')) || 0 })} placeholder="4000000" />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Segment *</label>
              <div className="flex gap-1.5">
                {SEGMENTS.map(s => (
                  <button key={s} onClick={() => setDraft({ ...draft, segment: s })}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-barlow font-medium border transition-all
                      ${draft.segment === s ? 'bg-mk-lblue/15 border-mk-lblue/40 text-mk-lblue' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Winner</label>
              <select value={draft.winner} onChange={e => setDraft({ ...draft, winner: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-mk-lblue/50">
                <option value="">— Not yet awarded / unknown —</option>
                {KNOWN_COMPETITORS.map(c => <option key={c} value={c} className="bg-mk-blue">{c}</option>)}
              </select>
            </div>

            <Field label="Award date" value={draft.awardDate} onChange={v => setDraft({ ...draft, awardDate: v })} placeholder="2026-04-12" />

            <div className="md:col-span-2">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Losing bidders (comma-separated)</label>
              <input type="text" value={(draft.losingBidders ?? []).join(', ')}
                onChange={e => setDraft({ ...draft, losingBidders: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="Trane Technologies, Siemens Smart Infrastructure"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button onClick={saveDraft} className="flex items-center gap-2 px-5 py-2.5 bg-mk-lblue text-mk-blue font-barlow font-semibold text-sm rounded-lg hover:bg-mk-lblue/85 transition-all">
              <Check size={14} /> {editingId ? 'Update record' : 'Save to database'}
            </button>
            {draft.sourceFile && <span className="text-white/30 text-xs font-mono flex items-center gap-1"><FileText size={11} /> {draft.sourceFile}</span>}
          </div>
        </div>
      )}

      {/* ── STATS STRIP ── */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatCard label="RFPs logged" value={records.length} />
          <StatCard label="With known winner" value={records.filter(r => r.winner).length} />
          <StatCard label="Segments covered" value={new Set(records.map(r => r.segment).filter(Boolean)).size} />
          <StatCard label="States covered" value={new Set(records.map(r => r.state).filter(Boolean)).size} />
        </div>
      )}

      {/* ── TOP WINNERS ── */}
      {topWinners.length > 0 && (
        <div className="mb-5 bg-white/[0.03] border border-white/8 rounded-xl p-4">
          <h4 className="font-barlow font-semibold text-white text-sm mb-3 flex items-center gap-2">
            <Trophy size={13} className="text-mk-gold" /> Win leaders (from logged RFPs)
          </h4>
          <div className="space-y-2">
            {topWinners.map(([name, s]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="font-barlow text-white/80">{name}</span>
                <span className="font-mono text-xs text-white/50">
                  {s.wins}W / {s.bids}B · {((s.wins / s.bids) * 100).toFixed(0)}% win rate
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SEARCH + EXPORT ── */}
      {records.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search RFPs…"
              className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>
          <div className="flex gap-1.5">
            {['', ...SEGMENTS].map(s => (
              <button key={s || 'all'} onClick={() => setSegFilter(s)}
                className={`text-xs font-barlow font-medium px-3 py-1.5 rounded-full border transition-all
                  ${segFilter === s ? 'bg-mk-blue text-white border-mk-lblue' : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70'}`}>
                {s || 'All'}
              </button>
            ))}
          </div>
          <button onClick={exportJSON} className="flex items-center gap-1.5 px-3 py-2 bg-mk-green/15 text-mk-lgreen border border-mk-green/30 rounded-lg text-xs font-barlow font-medium hover:bg-mk-green/25 transition-all">
            <Download size={13} /> Export rfp_history.json
          </button>
        </div>
      )}

      {/* ── RECORDS TABLE ── */}
      {filtered.length > 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-xl divide-y divide-white/5">
          {filtered.map(r => (
            <div key={r.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-barlow font-semibold text-white text-sm">{r.title || '(untitled)'}</span>
                  {r.segment && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/50">{r.segment}</span>}
                  {r.state && <span className="text-[10px] font-mono text-white/40">{r.state}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-white/45 flex-wrap">
                  {r.agency && <span>{r.agency}</span>}
                  {r.value > 0 && <span className="text-mk-lgreen font-mono">${(r.value/1e6).toFixed(1)}M</span>}
                  {r.winner && <span className="flex items-center gap-1"><Trophy size={10} className="text-mk-gold" />{r.winner}</span>}
                  {r.awardDate && <span className="font-mono text-white/30">{r.awardDate}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => editRecord(r)} className="w-7 h-7 rounded flex items-center justify-center text-white/30 hover:text-mk-lblue hover:bg-white/5"><Edit3 size={12} /></button>
                <button onClick={() => deleteRecord(r.id)} className="w-7 h-7 rounded flex items-center justify-center text-white/30 hover:text-mk-orange hover:bg-white/5"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : records.length === 0 && !draft ? (
        <div className="text-center py-12 text-white/30 font-barlow text-sm">
          No RFPs logged yet. Upload your first document above to start building the database.
        </div>
      ) : null}

      {/* ── COMMIT INSTRUCTIONS ── */}
      {records.length > 0 && (
        <div className="mt-5 flex items-start gap-3 bg-mk-lblue/8 border border-mk-lblue/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-mk-lblue flex-shrink-0 mt-0.5" />
          <p className="text-white/55 text-xs leading-relaxed">
            To make these records feed the prediction engine permanently, click <span className="text-mk-lgreen font-medium">Export rfp_history.json</span> and
            commit it to your repo at <span className="font-mono text-white/70">public/data/rfp_history.json</span>.
            The win rates will then flow into every prediction.
          </p>
        </div>
      )}
    </div>
  )
}

// ── small helpers ──
function Field({ label, value, onChange, placeholder, maxLength, full }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <div className="font-barlow font-bold text-2xl text-white leading-none">{value}</div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-white/35 mt-1.5">{label}</div>
    </div>
  )
}
