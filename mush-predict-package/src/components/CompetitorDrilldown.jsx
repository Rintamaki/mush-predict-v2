import IncumbencyPanel from './IncumbencyPanel'
import UsHeatMap from './UsHeatMap'
import { SignalMixDonut, SegmentFocus, TimelineStrip } from './CompetitorCharts'

/**
 * Inline drill-down panel that appears below a Strategic Forecast row
 * when an AE clicks to expand a competitor.
 */
export default function CompetitorDrilldown({ competitor }) {
  return (
    <div className="mt-3 animate-fade-in space-y-3">
      {/* Heat map gets full width */}
      <UsHeatMap competitor={competitor} />

      {/* Three smaller widgets in a grid */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <SignalMixDonut   competitor={competitor} />
    <SegmentFocus     competitor={competitor} />
    <TimelineStrip    competitor={competitor} />
    <IncumbencyPanel  competitor={competitor} />
  </div>

    </div>
  )
}
