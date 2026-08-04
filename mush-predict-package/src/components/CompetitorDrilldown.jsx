import IncumbencyPanel from './IncumbencyPanel'
import UsHeatMap from './UsHeatMap'
import { SignalMixDonut, SegmentFocus, TimelineStrip } from './CompetitorCharts'
import HiringIntent from './HiringIntent'

/**
 * Inline drill-down panel that appears below a Strategic Forecast row
 * when an AE clicks to expand a competitor.
 *
 * Receives `signals` (the full accumulated signals.json array), filters it
 * down to just this competitor once, and passes that pre-filtered set to
 * every child widget — so the heat map, charts, incumbency panel, and the
 * hiring-intent view all reflect accumulated history, not just today's
 * snapshot.
 */
export default function CompetitorDrilldown({ competitor, signals = [] }) {
  const competitorSignals = (signals || []).filter(s => s.company === competitor.name)

  return (
    <div className="mt-3 animate-fade-in space-y-3">
      {/* Heat map gets full width */}
      <UsHeatMap competitor={competitor} signals={competitorSignals} />

      {/* Hiring intent — where/what they're hiring, and the strategic read */}
      <HiringIntent signals={competitorSignals} />

      {/* Four smaller widgets in a grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SignalMixDonut  competitor={competitor} signals={competitorSignals} />
        <SegmentFocus    competitor={competitor} signals={competitorSignals} />
        <TimelineStrip   competitor={competitor} signals={competitorSignals} />
        <IncumbencyPanel competitor={competitor} signals={competitorSignals} />
      </div>
    </div>
  )
}
