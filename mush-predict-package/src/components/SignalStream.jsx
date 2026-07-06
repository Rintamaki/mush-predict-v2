import { useEffect, useState, useMemo } from 'react'
import {
  Briefcase, DollarSign, FileText, Award, Building, Mic, Users, Newspaper,
  Filter, X
} from 'lucide-react'

// ── Metadata for each signal type ─────────────────────────────────────────────
const TYPE_META = {
  contract: { icon: DollarSign, label: 'Federal contract', color: 'text-mk-lgreen' },
  bid:      { icon: FileText,   label: 'Open bid',         color: 'text-mk-lblue'  },
  job:      { icon: Briefcase,  label: 'Job posting',      color: 'text-mk-gold'   },
  exec:     { icon: Users,      label: 'Executive move',   color: 'text-mk-orange' },
  patent:   { icon: Award,      label: 'Patent filing',    color: 'text-mk-lgreen' },
  earnings: { icon: Mic,        label: 'Earnings call',    color: 'text-mk-lblue'  },
  permit:   { icon: Building,   label: 'Building permit',  color: 'text-mk-gold'   },
  news:     { icon: Newspaper,  label: 'News',             color: 'text-mk-lblue'  },
}

// ── Region groupings — states mapped to broader regions ───────────────────────
const REGIONS = {
  'South':       ['TX', 'OK', 'LA', 'AR', 'MS', 'AL'],
  'Pacific NW':  ['WA', 'OR', 'ID', 'MT', 'AK'],
  'West':        ['CA', 'NV', 'AZ', 'UT', 'CO', 'WY', 'NM', 'HI'],
  'Midwest':     ['IL', 'IN', 'OH', 'MI', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'SD', 'ND'],
  'Northeast':   ['NY', 'NJ', 'PA', 'MA', 'CT', 'RI', 'NH', 'VT', 'ME'],
  'Southeast':   ['FL', 'GA', 'SC', 'NC', 'VA', 'WV', 'KY', 'TN', 'MD', 'DE', 'DC'],
}

function getRegionForState(state) {
  if (!state) return null
  const s = state.toUpperCase()
  for (const [region, states] of Object.entries(REGIONS)) {
    if (states.includes(s)) return region
  }
  return 'Other'
}

// ── The Signal Stream component ───────────────────────────────────────────────
export default function SignalStream() {
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)

  // Filter state — null means "all"
  const [companyFilter, setCompanyFilter] = useState(null)
  const [typeFilter,    setTypeFilter]    = useState(null)
  const [regionFilter,  setRegionFilter]  = useState(null)

  useEffect(() => {
    fetch('./data/signals.json?t=' + Date.now())
      .then(r => r.ok ? r.json() : [])
      .then(json => setSignals(Array.isArray(json) ? json : []))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false))
  }, [])

  // Derive filter option lists from actual data
  const { companies, types, regions } = useMemo(() => {
    const companySet = new Set()
    const typeSet    = new Set()
    const regionSet  = new Set()
    signals.forEach(s => {
      if (s.company) companySet.add(s.company)
      if (s.type)    typeSet.add(s.type)
      const r = getRegionForState(s.state)
      if (r) regionSet.add(r)
    })
    return {
      companies: [...companySet].sort(),
      types:     [...typeSet].sort(),
      regions:   [...regionSet].sort(),
    }
  }, [signals])

  // Apply filters
  const filtered = useMemo(() => {
    return signals.filter(s => {
      if (companyFilter && s.company !== companyFilter)                 return false
      if (typeFilter    && s.type    !== typeFilter)                    return false
      if (regionFilter  && getRegionForState(s.state) !== regionFilter) return false
      return true
    })
  }, [signals, companyFilter, typeFilter, regionFilter])

  // Sort newest first
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = new Date(a.timestamp || 0).getTime() || 0
      const db = new Date(b.timestamp || 0).getTime() || 0
      return db - da
    })
  }, [filtered])

  const activeFilterCount = [companyFilter, typeFilter, regionFilter].filter(Boolean).length

  function clearAll() {
    setCompanyFilter(null); setTypeFilter(null); setRegionFilter(null)
  }

  if (loading) return <div className="text-white/40 text-sm p-4">Loading signals…</div>

  if (!signals.length) {
    return (
      <div className="text-white/40 text-sm p-4">
        No signals yet — the daily pipeline will populate this on its next run.
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header with filter summary */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-barlow font-semibold text-white text-lg">Signal Stream</h2>
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">
          {sorted.length} shown · {signals.length} accumulated
        </div>
      </div>

      {/* Filter row */}
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={12} className="text-white/40" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
            Filter · {activeFilterCount > 0 ? `${activeFilterCount} active` : 'showing all'}
          </span>
          {activeFilterCount > 0 && (
            <button onClick={clearAll} className="ml-auto text-[10px] font-mono uppercase tracking-wider text-mk-orange hover:text-mk-orange/80 flex items-center gap-1">
              <X size={10} /> Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <FilterDropdown
            label="Company"
            value={companyFilter}
            options={companies}
            onChange={setCompanyFilter}
          />
          <FilterDropdown
            label="Type"
            value={typeFilter}
            options={types}
            formatOption={t => TYPE_META[t]?.label || t}
            onChange={setTypeFilter}
          />
          <FilterDropdown
            label="Region"
            value={regionFilter}
            options={regions}
            onChange={setRegionFilter}
          />
        </div>
      </div>

      {/* Signal list */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-white/30 font-barlow text-sm">
          No signals match these filters.
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.slice(0, 100).map(signal => {
            const meta = TYPE_META[signal.type] || {
              icon: FileText, label: signal.type, color: 'text-white/50'
            }
            const Icon = meta.icon
            const region = getRegionForState(signal.state)
            return (
              <div
                key={signal.id}
                className="px-4 py-3 bg-white/[0.02] border border-white/5 rounded-md hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Icon size={14} className={`${meta.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-barlow font-semibold text-white">
                      {signal.company}
                    </div>
                    <div className="text-xs text-white/65 mt-0.5">
                      {signal.title}
                    </div>
                    <div className="text-[10px] font-mono text-white/30 mt-1 flex items-center gap-2 flex-wrap">
                      <span className={meta.color}>{meta.label}</span>
                      <span>·</span>
                      <span>{signal.timestamp || 'no date'}</span>
                      {signal.state && (
                        <>
                          <span>·</span>
                          <span className="text-mk-lblue/70">{signal.state}{region && region !== 'Other' ? ` · ${region}` : ''}</span>
                        </>
                      )}
                      {signal.source && (
                        <>
                          <span>·</span>
                          <span>{signal.source}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {sorted.length > 100 && (
            <div className="text-center py-4 text-[10px] font-mono uppercase tracking-wider text-white/25">
              showing 100 newest of {sorted.length} · narrow filters to see more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Filter dropdown ───────────────────────────────────────────────────────────
function FilterDropdown({ label, value, options, onChange, formatOption = (o) => o }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-wider text-white/35 mb-1">
        {label}
      </label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-md text-xs text-white/80 focus:outline-none focus:border-mk-lblue/50"
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{formatOption(opt)}</option>
        ))}
      </select>
    </div>
  )
}
