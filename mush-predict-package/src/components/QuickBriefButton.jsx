import { useState } from 'react'
import { Briefcase, X } from 'lucide-react'
import { generateBrief, formatBriefAsText } from '../engine/briefGenerator'
import { BriefDisplay } from './PreCallBrief'

/**
 * QuickBriefButton
 *
 * Small button that appears on every prediction card. Click it to generate
 * a pre-call brief for the current opportunity in a modal — no need to
 * navigate to another tab.
 */
export default function QuickBriefButton({ opportunity, competitors, signals, rfpRecords }) {
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState(null)

  function handleOpen() {
    const result = generateBrief({
      opportunity,
      meetingContext: { rfpTitle: opportunity.title, myRole: '', meetingPurpose: '' },
      competitors, signals, rfpHistory: rfpRecords,
    })
    setBrief(result)
    setOpen(true)
  }

  function copyBrief() {
    if (!brief) return
    navigator.clipboard.writeText(formatBriefAsText(brief)).catch(() => {})
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-[11px] font-mono uppercase tracking-wider text-white/60 hover:text-white transition-colors"
        title="Generate a pre-call brief for this opportunity"
      >
        <Briefcase size={11} />
        Brief
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="fixed inset-4 md:inset-16 bg-mk-blue border border-white/10 rounded-2xl z-50 overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
              <h3 className="font-barlow font-semibold text-white text-base flex items-center gap-2">
                <Briefcase size={14} className="text-mk-lblue" />
                Pre-call brief
              </h3>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white/80">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {brief && <BriefDisplay brief={brief} onCopy={copyBrief} />}
            </div>
          </div>
        </>
      )}
    </>
  )
}
