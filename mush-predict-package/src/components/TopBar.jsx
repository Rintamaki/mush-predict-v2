import { Activity, Sliders } from 'lucide-react'

export default function TopBar({ lastUpdated, sourceCount, onTuneClick }) {
  return (
    <header className="sticky top-0 z-50 bg-mk-blue border-b border-white/10 shadow-xl shadow-mk-blue/30">
      <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-white to-mk-lblue/60 flex items-center justify-center shadow-md">
            <span className="text-mk-blue font-barlow font-bold text-sm leading-none">Mc</span>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-mk-lgreen rounded-full border-2 border-mk-blue animate-pulse-soft" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-barlow font-semibold text-white text-base tracking-wide">McKinstry Predict</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-mk-lgreen bg-mk-lgreen/12 px-2 py-0.5 rounded">v1 · Phase 1</span>
            </div>
            <div className="text-white/45 font-barlow text-xs">Competitive intelligence + opportunity scoring</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
            <Activity size={11} className="text-mk-lgreen animate-pulse-soft" />
            <span className="font-mono text-[10px] text-white/65 uppercase tracking-wider">
              {sourceCount} sources · refreshed {lastUpdated}
            </span>
          </div>
          <button
            onClick={onTuneClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/60 hover:text-white text-xs transition-colors"
            title="Tune scoring weights"
          >
            <Sliders size={11} />
            <span className="font-mono uppercase tracking-wider text-[10px]">Tune</span>
          </button>
        </div>
      </div>
    </header>
  )
}