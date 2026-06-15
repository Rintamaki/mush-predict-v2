import { Target, TrendingUp, Activity, Database } from 'lucide-react'

const TABS = [
  { key: 'predict',  label: 'RFP Scorer',          icon: Target },
  { key: 'forecast', label: 'Strategic Forecast',  icon: TrendingUp },
  { key: 'stream',   label: 'Signal Stream',       icon: Activity },
  { key: 'rfpdb',    label: 'RFP Database',         icon: Database },
]

export default function TabNav({ active, setActive }) {
  return (
    <nav className="flex gap-1 mb-6 border-b border-white/8">
      {TABS.map(t => {
        const Icon = t.icon
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`flex items-center gap-2 px-4 py-3 font-barlow font-medium text-sm transition-all -mb-px border-b-2
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
