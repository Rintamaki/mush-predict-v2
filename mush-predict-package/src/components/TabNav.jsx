import { Target as TargetIcon, TrendingUp, Activity, Database, Crosshair, Briefcase } from 'lucide-react'

const TABS = [
  { key: 'predict',    label: 'RFP Scorer',          icon: TargetIcon },
  { key: 'forecast',   label: 'Strategic Forecast',  icon: TrendingUp },
  { key: 'stream',     label: 'Signal Stream',       icon: Activity },
  { key: 'rfpdb',      label: 'RFP Database',        icon: Database },
  { key: 'accuracy',   label: 'Accuracy',            icon: Crosshair },
  { key: 'brief',      label: 'Pre-Call Brief',      icon: Briefcase },
]

export default function TabNav({ active, setActive }) {
  return (
    <nav className="flex gap-1 mb-6 border-b border-white/8 overflow-x-auto">
      {TABS.map(t => {
        const Icon = t.icon
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`flex items-center gap-2 px-4 py-3 font-barlow font-medium text-sm transition-all -mb-px border-b-2 flex-shrink-0
              ${isActive
                ? 'border-mk-lblue text-white'
                : 'border-transparent text-white/40 hover:text-white/70 hover:border-white/15'
              }`}
          >
            <Icon size={14} />
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
