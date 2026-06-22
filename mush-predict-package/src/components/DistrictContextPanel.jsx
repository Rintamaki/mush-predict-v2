import { useState, useEffect } from 'react'
import { Building2, Users, DollarSign, School, AlertCircle, Loader2 } from 'lucide-react'
import { enrichOpportunity } from '../engine/districtLookup'

/**
 * DistrictContextPanel
 *
 * Renders above the prediction cards on the RFP Scorer when the
 * opportunity is a K-12 district. Pulls enrollment, schools, finance,
 * and locale data from districtapi.dev (cached for 30 days per district).
 *
 * Gracefully handles three cases:
 *   - No API key configured     → renders nothing
 *   - Not a school district     → renders nothing
 *   - Lookup returned no match  → renders a small "no profile found" note
 */
export default function DistrictContextPanel({ opportunity }) {
  const [loading, setLoading]   = useState(false)
  const [district, setDistrict] = useState(null)
  const [tried, setTried]       = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!opportunity?.agency) return

    setLoading(true)
    setTried(false)
    enrichOpportunity(opportunity)
      .then(result => {
        if (cancelled) return
        setDistrict(result)
        setTried(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [opportunity?.agency, opportunity?.state])

  // Loading state
  if (loading) {
    return (
      <div className="bg-mk-lblue/5 border border-mk-lblue/20 rounded-xl p-4 mb-4 animate-fade-in">
        <div className="flex items-center gap-2 text-mk-lblue text-sm">
          <Loader2 size={14} className="animate-spin" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Loading district context…</span>
        </div>
      </div>
    )
  }

  // No district profile — only show if we attempted lookup and have an agency name
  if (!district && tried && opportunity.segment === 'Schools' && opportunity.agency) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 mb-4 animate-fade-in">
        <div className="flex items-start gap-2 text-white/40 text-xs">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span>
            No NCES profile found for <span className="text-white/60">{opportunity.agency}</span>.
            The prediction below still works — just no enrichment data available.
          </span>
        </div>
      </div>
    )
  }

  // Nothing to render — wrong segment, no agency, or lookup not applicable
  if (!district) return null

  const enrollment = district.enrollment?.total
  const expenditure = district.finance?.perPupilExpenditure
  const schoolsCount = district.schoolsCount
  const enrollmentYear = district.enrollment?.year
  const locale = district.locale || district.localeType

  // Estimate market opportunity scale based on district size
  const opportunitySize = enrollment
    ? enrollment >= 50000 ? 'Major district'
      : enrollment >= 10000 ? 'Large district'
      : enrollment >= 3000  ? 'Mid-size district'
      : 'Small district'
    : null

  return (
    <div className="bg-white/[0.03] border border-mk-lblue/25 rounded-xl p-5 mb-4 animate-fade-in">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={14} className="text-mk-lblue" />
            <h3 className="font-barlow font-semibold text-white text-base leading-tight">
              {district.name}
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mk-lblue/15 text-mk-lblue border border-mk-lblue/25">
              {district.state}
            </span>
          </div>
          {opportunitySize && (
            <p className="text-white/45 text-xs">
              {opportunitySize}{locale ? ` · ${locale}` : ''}
            </p>
          )}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/30 flex-shrink-0">
          NCES district profile
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={<Users size={14} />}
          label="Enrollment"
          value={enrollment ? enrollment.toLocaleString() : '—'}
          sublabel={enrollmentYear || 'students'}
        />
        <Stat
          icon={<School size={14} />}
          label="Schools"
          value={schoolsCount ?? '—'}
          sublabel="in district"
        />
        <Stat
          icon={<DollarSign size={14} />}
          label="Per-pupil spend"
          value={expenditure ? `$${expenditure.toLocaleString()}` : '—'}
          sublabel="annual"
        />
        <Stat
          icon={<Building2 size={14} />}
          label="Total budget est."
          value={enrollment && expenditure
            ? `$${((enrollment * expenditure) / 1e6).toFixed(0)}M`
            : '—'}
          sublabel="annual operating"
        />
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-white/30 font-mono">
        <span>NCES ID: {district.ncesId || 'unknown'}</span>
        <span>Source: districtapi.dev · cached 30 days</span>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, sublabel }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-white/40 mb-1.5">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-barlow font-bold text-white text-lg leading-tight">{value}</div>
      <div className="text-[10px] font-mono text-white/30 mt-0.5">{sublabel}</div>
    </div>
  )
}
