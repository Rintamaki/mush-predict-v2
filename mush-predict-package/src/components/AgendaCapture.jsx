import { useState, useEffect } from 'react'
import {
  ClipboardList, Send, Loader2, Check, AlertCircle,
  ExternalLink, Star, Calendar, MapPin
} from 'lucide-react'

/**
 * AgendaCapture
 *
 * A new tab where AEs paste in agenda content they see on district websites.
 * The system extracts action types and relevance scores, then commits the
 * capture to a shared JSON file in the repo via the serverless function.
 */
export default function AgendaCapture() {
  const [form, setForm] = useState({
    agency: '',
    state: 'TX',
    url: '',
    meetingDate: '',
    agendaText: '',
    submittedBy: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [captures, setCaptures] = useState([])

  useEffect(() => {
    // Load recent captures from the shared file
    fetch('./data/agenda_captures.json?t=' + Date.now())
      .then(r => r.ok ? r.json() : [])
      .then(arr => setCaptures(Array.isArray(arr) ? arr : []))
      .catch(() => setCaptures([]))
  }, [result])

  async function handleSubmit() {
    if (!form.agency || !form.agendaText || form.agendaText.length < 50) {
      setResult({ ok: false, message: 'Agency and at least 50 characters of agenda text required.' })
      return
    }
    setSubmitting(true)
    setResult(null)

    try {
      const resp = await fetch('/api/capture-agenda', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ ok: true, capture: data.capture, message: 'Captured successfully.' })
        // Reset the form
        setForm({ ...form, url: '', meetingDate: '', agendaText: '' })
      } else {
        setResult({ ok: false, message: data.error || 'Something went wrong.' })
      }
    } catch (err) {
      setResult({ ok: false, message: 'Network error: ' + err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const recentCaptures = captures.slice(0, 20)

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg flex items-center gap-2">
          <ClipboardList size={16} className="text-mk-lblue" />
          Agenda capture
        </h2>
        <p className="text-white/40 text-sm mt-0.5">
          Paste in board meeting agendas or minutes you spot on district websites. The system extracts action types and keeps a shared record everyone on the team can reference in briefs.
        </p>
      </div>

      {/* Capture form */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Agency / District *</label>
            <input type="text" value={form.agency}
              onChange={e => setForm({ ...form, agency: e.target.value })}
              placeholder="e.g. Plano ISD"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">State</label>
            <input type="text" maxLength={2} value={form.state}
              onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white uppercase focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Meeting Date (optional)</label>
            <input type="date" value={form.meetingDate}
              onChange={e => setForm({ ...form, meetingDate: e.target.value })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Source URL (optional)</label>
            <input type="text" value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder="https://boarddocs.com/..."
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Agenda text *</label>
            <textarea rows={10} value={form.agendaText}
              onChange={e => setForm({ ...form, agendaText: e.target.value })}
              placeholder="Copy and paste agenda items, meeting minutes, or the whole packet content here. The system will extract action types and relevance signals automatically."
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-mk-lblue/50 resize-none font-mono" />
            <div className="mt-1 text-[10px] font-mono text-white/25">
              {form.agendaText.length.toLocaleString()} characters
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1.5">Your initials (optional — for team attribution)</label>
            <input type="text" maxLength={4} value={form.submittedBy}
              onChange={e => setForm({ ...form, submittedBy: e.target.value.toUpperCase() })}
              placeholder="FR"
              className="w-32 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white uppercase focus:outline-none focus:border-mk-lblue/50" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSubmit}
            disabled={!form.agency || !form.agendaText || submitting}
            className="flex items-center gap-2 px-5 py-2.5 bg-mk-lblue text-mk-blue font-barlow font-semibold text-sm rounded-lg hover:bg-mk-lblue/85 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-mk-lblue/20">
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Capturing…</> : <><Send size={13} /> Submit capture</>}
          </button>

          {result && (
            <div className={`flex items-center gap-2 text-sm ${result.ok ? 'text-mk-lgreen' : 'text-mk-orange'}`}>
              {result.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {result.message}
              {result.ok && result.capture && (
                <span className="text-white/40 text-xs font-mono ml-1">
                  · relevance {result.capture.relevanceScore}/5 · {result.capture.actionTypes.length} action types
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent captures */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-barlow font-semibold text-white text-sm">Recent captures</h3>
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
            {captures.length} total · showing 20 newest
          </span>
        </div>

        {recentCaptures.length === 0 ? (
          <div className="bg-white/[0.02] border border-white/8 rounded-xl p-8 text-center">
            <ClipboardList size={20} className="text-white/25 mx-auto mb-2" />
            <p className="text-white/40 text-sm font-barlow">No captures yet. Be the first — paste in an agenda above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentCaptures.map(cap => (
              <div key={cap.id} className="bg-white/[0.02] border border-white/8 rounded-lg p-4 hover:bg-white/[0.03] transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-barlow font-semibold text-white text-sm">{cap.agency}</h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/50">{cap.state}</span>
                      {cap.submittedBy && (
                        <span className="text-[10px] font-mono text-white/30">by {cap.submittedBy}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-white/35">
                      {cap.meetingDate && <><Calendar size={9} /><span>{cap.meetingDate}</span><span>·</span></>}
                      <span>captured {new Date(cap.capturedAt).toLocaleDateString()}</span>
                      {cap.url && (
                        <>
                          <span>·</span>
                          <a href={cap.url} target="_blank" rel="noopener noreferrer" className="text-mk-lblue hover:text-mk-lblue/80 flex items-center gap-0.5">
                            source <ExternalLink size={8} />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <RelevanceBadge score={cap.relevanceScore} />
                </div>

                {cap.actionTypes?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {cap.actionTypes.map(a => (
                      <span key={a} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mk-lblue/10 text-mk-lblue border border-mk-lblue/20">
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                {cap.items?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-white/35 mb-1">Detected agenda items</div>
                    <ul className="space-y-0.5">
                      {cap.items.slice(0, 4).map((item, i) => (
                        <li key={i} className="text-xs text-white/65 leading-relaxed">• {item}</li>
                      ))}
                      {cap.items.length > 4 && (
                        <li className="text-[10px] font-mono text-white/25">+ {cap.items.length - 4} more items</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RelevanceBadge({ score }) {
  const color = score >= 4 ? 'text-mk-orange border-mk-orange/30 bg-mk-orange/10'
              : score >= 2 ? 'text-mk-gold   border-mk-gold/30   bg-mk-gold/10'
              :              'text-white/40  border-white/10     bg-white/5'
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-mono uppercase tracking-wider ${color} flex-shrink-0`}>
      <Star size={10} />
      {score}/5
    </div>
  )
}
