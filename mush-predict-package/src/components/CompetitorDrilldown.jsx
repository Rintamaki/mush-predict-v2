import IncumbencyPanel from './IncumbencyPanel'
import UsHeatMap from './UsHeatMap'
import { SignalMixDonut, SegmentFocus, TimelineStrip } from './CompetitorCharts'

/**
 * Inline drill-down panel that appears below a Strategic Forecast row
 * when an AE clicks to expand a competitor.
 *
 * Now receives `signals` (the accumulated signals.json array) and passes
 * both the competitor's accumulated signals AND the snapshot object down to
 * each widget, so the heat map, signal mix, segment focus, timeline, and
 * incumbency panel all reflect the full accumulated history rather than
 * just today's pipeline snapshot.
 */
export default function CompetitorDrilldown({ competitor, signals = [] }) {
  // Filter the full signals array down to just this competitor's signals once,
  // here, so every child widget gets the same pre-filtered set.
  const competitorSignals = (signals || []).filter(s => s.company === competitor.name)

  return (
    <div className="mt-3 animate-fade-in space-y-3">
      {/* Heat map gets full width */}
      <UsHeatMap competitor={competitor} signals={competitorSignals} />

      {/* Three smaller widgets in a grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SignalMixDonut  competitor={competitor} signals={competitorSignals} />
        <SegmentFocus    competitor={competitor} signals={competitorSignals} />
        <TimelineStrip   competitor={competitor} signals={competitorSignals} />
        <IncumbencyPanel competitor={competitor} signals={competitorSignals} />
      </div>
    </div>
  )
}
