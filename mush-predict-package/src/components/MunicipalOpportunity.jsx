import { useEffect, useState, useMemo } from 'react'
import {
  Building2, TrendingUp, Minus, Search, Loader2, Award, DollarSign,
  Target, ChevronDown, ChevronRight,
} from 'lucide-react'

/**
 * MunicipalOpportunity.jsx
 *
 * "Cities & Counties" tab — reads municipal_intelligence.json (produced by
 * the HB103 pipeline: tx_municipal_finance.py -> municipal_intelligence.py)
 * and shows a ranked, searchable, sortable table of Texas municipalities
 * with their opportunity scores.
 *
 * Mirrors the DistrictSpending pattern: same visual language, same sort
 * controls, same empty-state handling. The differences reflect the
 * different data — municipal intelligence is score-first (there's no clean
 * per-city expenditure column the way TEA gives for districts), so the
 * primary sort is opportunity score, and rows expand to show the audit
 * breakdown + facility-relevant bond history.
 */
export default function MunicipalOpportunity() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [search,  setSearch]  = useState('')
  const [sortBy,  setSortBy]  = useState('opportunity_score')

  useEffect(() => {
    fetch('./data/municipal_intelligence.json?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!data?.municipalities) return []
    const s = search.trim().toLowerCase()
    let list = s
      ? data.municipalities.filter(m =>
          m.entity_name?.toLowerCase().includes(s) ||
          m.county?.toLowerCase().includes(s))
      : data.municipalities

    return [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.entity_name || '').localeCompare(b.entity_name || '')
      }
      if (sortBy === 'opportunity_score') {
        return ((b.opportunity_score ?? -1) - (a.opportunity_score ?? -1))
      }
      if (sortBy === 'facility_bonds') {
        return (b.facility_bonds?.length || 0) - (a.facility_bonds?.length || 0)
      }
      if (sortBy === 'bond_value') {
        const av = a.audit?.bond_value?.total_passed_amount || 0
        const bv = b.audit?.bond_value?.total_passed_amount || 0
        return bv - av
      }
      return 0
    })
  }, [data, search, sortBy])

  if (loading) return (
    <div className="text-white/40 text-sm p-4 flex items-center gap-2">
      <Loader2 size={14} className="animate-spin" /> Loading municipal intelligence data…
    </div>
  )

  if (error || data?.status === 'upstream_not_configured') {
    return (
      <div className="text-white/40 text-sm p-4">
        <p className="mb-2">Municipal data is not yet configured.</p>
        <p className="text-xs leading-relaxed">
          To populate this tab: (1) download the HB103 spreadsheet from the Texas
          Comptroller, (2) upload it to <span className="font-mono text-white/60">scrapers/tea_data/municipal_bonds.xlsx</span>,
          (3) fill in <span className="font-mono text-white/60">EXPECTED_COLUMNS</span> in <span className="font-mono text-white/60">scrapers/tx_municipal_finance.py</span>,
          (4) run the "TEA District Finance Refresh" workflow. See the municipal build kit README for details.
        </p>
      </div>
    )
  }

  if (!data?.municipalities?.length) {
    return (
      <div className="text-white/40 text-sm p-4">
        No municipality data yet — the HB103 pipeline hasn't produced output.
        Run the "TEA District Finance Refresh" workflow after uploading the source spreadsheet.
      </div>
    )
  }

  const scored = data.municipalities.filter(m => m.opportunity_score != null).length

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="font-barlow font-semibold text-white text-lg flex items-center gap-2">
          <Building2 size={16} className="text-mk-gold" />
          Texas cities &amp; counties
        </h2>
        <p className="text-white/40 text-sm mt-0.5">
          Municipal opportunity scoring based on bond activity, facility-relevant projects, and bond value — sourced from the Texas Comptroller HB103 database. Focused on where cities and counties are funding facility, energy, and infrastructure work.
        </p>
        <p className="text-white/25 text-[10px] font-mono mt-2">
          {data.municipalities.length} municipalities · {scored} scored · last refresh {data.generated_at ? new Date(data.generated_at).toLocaleDateString() : '—'}
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
            placeholder="Search cities, counties, or MUDs…"
            className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-mk-lblue/50"
          />
        </div>
        <div className="flex gap-1">
          <SortButton active={sortBy === 'opportunity_score'} onClick={() => setSortBy('opportunity_score')}>Score</SortButton>
          <SortButton active={sortBy === 'facility_bonds'}    onClick={() => setSortBy('facility_bonds')}>Facility bonds</SortButton>
          <SortButton active={sortBy === 'bond_value'}        onClick={() => setSortBy('bond_value')}>Bond $</SortButton>
          <SortButton active={sortBy === 'name'}              onClick={() => setSortBy('name')}>Name</SortButton>
        </div>
      </div>

      <div className="text-[10px] font-mono text-white/35 mb-2">
        Showing {Math.min(100, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} municipalities
      </div>

      {/* Municipality rows */}
      <div className="space-y-1">
        {filtered.slice(0, 100).map((m, i) => (
          <MunicipalRow key={m.entity_key || i} municipality={m} rank={i + 1} />
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

function MunicipalRow({ municipality, rank }) {
  const [open, setOpen] = useState(false)
  const m = municipality
  const score = m.opportunity_score
  const facilityBonds = m.facility_bonds || []
  const totalBondValue = m.audit?.bond_value?.total_passed_amount || 0

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-md hover:bg-white/[0.04] transition-colors overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full grid grid-cols-12 gap-3 items-center px-3 py-2.5 text-left"
      >
        <div className="col-span-1 flex items-center gap-1 text-[10px] font-mono text-white/40">
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          #{rank}
        </div>
        <div className="col-span-4 min-w-0">
          <div className="font-barlow font-semibold text-white text-sm truncate">
            {m.entity_name}
            {m.entity_type && (
              <span className="ml-2 text-[10px] font-mono text-white/40 uppercase tracking-wider">
                {m.entity_type}
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-white/30">
            {m.county ? `${m.county} County` : ''}
            {m.county && m.total_bonds_seen ? ' · ' : ''}
            {m.total_bonds_seen ? `${m.total_bonds_seen} bond${m.total_bonds_seen === 1 ? '' : 's'} on record` : ''}
          </div>
        </div>
        <div className="col-span-2 text-right">
          <ScoreBadge score={score} />
          <div className="text-[10px] font-mono text-white/35 mt-0.5">opportunity</div>
        </div>
        <div className="col-span-2 text-right">
          <div className="text-sm font-mono text-mk-gold">{facilityBonds.length}</div>
          <div className="text-[10px] font-mono text-white/35">facility bonds</div>
        </div>
        <div className="col-span-2 text-right">
          <div className="text-sm font-mono text-mk-lgreen">
            {totalBondValue > 0 ? `$${(totalBondValue / 1e6).toFixed(1)}M` : '—'}
          </div>
          <div className="text-[10px] font-mono text-white/35">passed $</div>
        </div>
        <div className="col-span-1 flex justify-end">
          <SubScoreDots sub={m.sub_scores} />
        </div>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 py-3 bg-white/[0.015]">
          <SubScoreAudit municipality={m} />
          {facilityBonds.length > 0 && (
            <FacilityBondsList bonds={facilityBonds} />
          )}
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score }) {
  if (score == null) {
    return <div className="text-sm font-mono text-white/25">—</div>
  }
  const color = score >= 70 ? 'text-mk-lgreen'
              : score >= 40 ? 'text-mk-gold'
              : 'text-white/60'
  return <div className={`text-sm font-mono font-semibold ${color}`}>{score}</div>
}

function SubScoreDots({ sub }) {
  if (!sub) return <span className="text-[10px] text-white/20 font-mono">—</span>
  const dot = (v, color) => (
    <span
      className="w-1.5 h-1.5 rounded-full"
      style={{
        background: v == null ? 'rgba(255,255,255,0.15)' : color,
        opacity: v == null ? 0.4 : Math.max(0.3, (v || 0) / 100),
      }}
      title={v == null ? 'no data' : String(v)}
    />
  )
  return (
    <div className="flex gap-1 items-center">
      {dot(sub.bond_activity,      '#569BB4')}
      {dot(sub.facility_relevance, '#D7944B')}
      {dot(sub.bond_value,         '#447D29')}
    </div>
  )
}

function SubScoreAudit({ municipality }) {
  const m = municipality
  const audit = m.audit || {}
  const sub = m.sub_scores || {}

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <AuditCard
        icon={<TrendingUp size={11} className="text-mk-lblue" />}
        title="Bond activity"
        score={sub.bond_activity}
        detail={audit.bond_activity
          ? `${audit.bond_activity.passed_recent} passed of ${audit.bond_activity.total_recent} recent bonds (last 5 yrs)`
          : 'No recent activity'}
      />
      <AuditCard
        icon={<Target size={11} className="text-mk-gold" />}
        title="Facility relevance"
        score={sub.facility_relevance}
        detail={audit.facility_relevance
          ? `${audit.facility_relevance.facility_bonds} of ${audit.facility_relevance.total_bonds} bonds are facility/energy/infra`
          : 'No bond data'}
      />
      <AuditCard
        icon={<DollarSign size={11} className="text-mk-lgreen" />}
        title="Bond value"
        score={sub.bond_value}
        detail={audit.bond_value?.total_passed_amount
          ? `$${(audit.bond_value.total_passed_amount / 1e6).toFixed(1)}M in passed bonds`
          : 'No passed bonds on record'}
      />
    </div>
  )
}

function AuditCard({ icon, title, score, detail }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-md px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-[11px] font-barlow text-white/70">
          {icon}
          {title}
        </div>
        <div className="text-xs font-mono text-white/80">
          {score == null ? '—' : score}
        </div>
      </div>
      <div className="text-[10px] font-mono text-white/45 leading-snug">{detail}</div>
    </div>
  )
}

function FacilityBondsList({ bonds }) {
  return (
    <div className="border-t border-white/5 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <Award size={11} className="text-mk-gold" />
        <div className="text-[11px] font-barlow text-white/70">
          Facility-relevant bonds ({bonds.length})
        </div>
      </div>
      <div className="space-y-1">
        {bonds.slice(0, 8).map((b, i) => (
          <div key={i} className="flex items-start justify-between gap-3 text-[11px] py-1 border-b border-white/5 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-white/80 truncate">{b.purpose || 'Unspecified purpose'}</div>
              <div className="text-[10px] font-mono text-white/35">
                {b.date || 'no date'}
                {b.passed === true && <span className="ml-2 text-mk-lgreen">passed</span>}
                {b.passed === false && <span className="ml-2 text-mk-orange">failed</span>}
              </div>
            </div>
            {b.amount > 0 && (
              <div className="font-mono text-white/60 flex-shrink-0">
                ${(b.amount / 1e6).toFixed(1)}M
              </div>
            )}
          </div>
        ))}
        {bonds.length > 8 && (
          <div className="text-[10px] font-mono text-white/25 pt-1">
            + {bonds.length - 8} more
          </div>
        )}
      </div>
    </div>
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
