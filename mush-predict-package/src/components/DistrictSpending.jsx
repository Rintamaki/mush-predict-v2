import { useEffect, useState, useMemo } from 'react'
import {
  School, TrendingUp, TrendingDown, Minus, Search, DollarSign,
  Loader2, ExternalLink
} from 'lucide-react'

export default function DistrictSpending() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('total_facility')

  useEffect(() => {
    fetch('./data/tx_district_finance.json?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!data?.districts) return []
    const s = search.trim().toLowerCase()
    let list = s
      ? data.districts.filter(d => d.district_name?.toLowerCase().includes(s))
      : data.districts

    return [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return a.district_name.localeCompare(b.district_name)
      }
      const aVal = a.spending?.[sortBy] || 0
      const bVal = b.spending?.[sortBy] || 0
      return bVal - aVal
    })
  }, [data, search, sortBy])

  if (loading) return <div className="text-white/40 text-sm p-4 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading TEA district data…</div>

  if (error) {
    return (
      <div className="text-white/40 text-sm p-4">
        <p className="mb-2">Could not load district spending data.</p>
        <p className="text-xs">Run the "TEA District Finance Refresh" workflow in GitHub Actions to generate this file.</p>
      </div>
    )
  }

  if (!data?.districts?.length) {
    return (
      <div className="text-white/40 text-sm p-4">
        No district data yet — the TEA scraper hasn't produced output. Run the "TEA District Finance Refresh" workflow.
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg flex items-center gap-2">
          <School size={16} className="text-mk-lblue" />
          Texas ISD facility spending
        </h2>
        <p className="text-white/40 text-sm mt-0.5">
          Actual annual expenditures for Plant M&O, Security, and Facilities Construction — sourced from TEA PEIMS data. Data lags 1-2 years but shows where facility dollars actually go.
        </p>
        <p className="text-white/25 text-[10px] font-mono mt-2">
          {data.district_count} districts · years {data.years_included?.join(', ')} · last refresh {new Date(data.generated_at).toLocaleDateString()}
        </p>
      </div>

      {/* Search + sort controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search districts…"
            className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-mk-lblue/50"
          />
        </div>
        <div className="flex gap-1">
          <SortButton active={sortBy === 'total_facility'}      onClick={() => setSortBy('total_facility')}>Total spend</SortButton>
          <SortButton active={sortBy === 'facilities_construction'} onClick={() => setSortBy('facilities_construction')}>Construction</SortButton>
          <SortButton active={sortBy === 'plant_maintenance'}   onClick={() => setSortBy('plant_maintenance')}>Plant M&O</SortButton>
          <SortButton active={sortBy === 'name'}                onClick={() => setSortBy('name')}>Name</SortButton>
        </div>
      </div>

      <div className="text-[10px] font-mono text-white/35 mb-2">
        Showing {Math.min(100, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} districts
      </div>

      {/* District table */}
      <div className="space-y-1">
        {filtered.slice(0, 100).map(d => (
          <DistrictRow key={d.district_id} district={d} />
        ))}
      </div>

      {filtered.length > 100 && (
        <div className="text-center py-4 text-[10px] font-mono uppercase tracking-wider text-white/25">
          showing top 100 of {filtered.length} · use search to narrow
        </div>
      )}
    </div>
  )
}

function DistrictRow({ district }) {
  const d = district
  const spend = d.spending
  const totalM = (spend.total_facility / 1e6).toFixed(1)
  const constrM = (spend.facilities_construction / 1e6).toFixed(1)
  const maintM  = (spend.plant_maintenance / 1e6).toFixed(1)

  // Year-over-year trend
  const trend = calculateTrend(d.history, 'plant_maintenance')

  return (
    <div className="grid grid-cols-12 gap-3 items-center bg-white/[0.02] border border-white/5 rounded-md px-3 py-2.5 hover:bg-white/[0.04] transition-colors">
      <div className="col-span-1 text-[10px] font-mono text-white/40">#{d.rank}</div>
      <div className="col-span-4 min-w-0">
        <div className="font-barlow font-semibold text-white text-sm truncate">{d.district_name}</div>
        <div className="text-[10px] font-mono text-white/30">FY {d.latest_year}</div>
      </div>
      <div className="col-span-2 text-right">
        <div className="text-sm font-mono text-white">${totalM}M</div>
        <div className="text-[10px] font-mono text-white/35">total facility</div>
      </div>
      <div className="col-span-2 text-right">
        <div className="text-sm font-mono text-mk-lgreen">${constrM}M</div>
        <div className="text-[10px] font-mono text-white/35">construction</div>
      </div>
      <div className="col-span-2 text-right">
        <div className="text-sm font-mono text-mk-lblue">${maintM}M</div>
        <div className="text-[10px] font-mono text-white/35">plant M&O</div>
      </div>
      <div className="col-span-1 flex justify-end">
        <TrendBadge trend={trend} />
      </div>
    </div>
  )
}

function calculateTrend(history, field) {
  if (!history || history.length < 2) return null
  const latest = history[history.length - 1][field] || 0
  const prev   = history[history.length - 2][field] || 0
  if (prev === 0) return null
  const pct = ((latest - prev) / prev) * 100
  return { pct, direction: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat' }
}

function TrendBadge({ trend }) {
  if (!trend) return <span className="text-[10px] text-white/20 font-mono">—</span>
  const { pct, direction } = trend
  if (direction === 'up') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-mono text-mk-lgreen">
        <TrendingUp size={10} /> +{pct.toFixed(0)}%
      </span>
    )
  }
  if (direction === 'down') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-mono text-mk-orange">
        <TrendingDown size={10} /> {pct.toFixed(0)}%
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] font-mono text-white/40">
      <Minus size={10} /> flat
    </span>
  )
}

function SortButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-md border transition-colors
        ${active
          ? 'bg-mk-lblue/15 border-mk-lblue/40 text-mk-lblue'
          : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}
    >
      {children}
    </button>
  )
}
