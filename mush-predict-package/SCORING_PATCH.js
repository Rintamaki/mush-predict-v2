// ============================================================================
// SCORING ENGINE PATCH — wire real RFP win rates into predictions
// ============================================================================
//
// This shows the EXACT changes to make in src/engine/scoringEngine.js
// so the prediction engine uses your real logged RFP outcomes instead
// of estimated win rates.
//
// ----------------------------------------------------------------------------
// STEP 1 — At the top of scoringEngine.js, add this import:
// ----------------------------------------------------------------------------

import { computeWinStats, getRealWinRate, getStateWinRate } from './rfpDatabase'

// ----------------------------------------------------------------------------
// STEP 2 — Add a module-level variable to hold the stats, plus a setter.
//          Put this near the top, after the imports:
// ----------------------------------------------------------------------------

let RFP_STATS = {}

/**
 * Call this once when RFP history loads (from App.jsx) so the engine
 * can use real win rates. Pass the array of rfp records.
 */
export function loadRFPStats(rfpRecords) {
  RFP_STATS = computeWinStats(rfpRecords || [])
}

// ----------------------------------------------------------------------------
// STEP 3 — REPLACE the existing computeHistoricalWinRate function with this.
//          It now checks real logged RFP data first, falling back to the
//          old estimate only when there isn't enough real data.
// ----------------------------------------------------------------------------

function computeHistoricalWinRate(competitor, opportunity) {
  // 1. Try REAL win rate from logged RFP outcomes (segment-specific)
  const realRate = getRealWinRate(RFP_STATS, competitor.name, opportunity.segment)
  if (realRate !== null) {
    return realRate   // real data wins — this is the whole point
  }

  // 2. Fall back to the original estimate from federal contract data
  const wins = competitor.contractAwards ?? []
  const bids = competitor.historicalBids ?? []
  const segBids = bids.filter(b => b.segment === opportunity.segment)
  const segWins = wins.filter(w => w.segment === opportunity.segment)

  if (segBids.length < 3) {
    if (bids.length >= 5) {
      return wins.length / bids.length
    }
    return 0.32  // industry-average ESCO win rate
  }
  return Math.min(0.85, segWins.length / segBids.length)
}

// ----------------------------------------------------------------------------
// STEP 4 (optional) — In scoreCompetitorOpportunity, you can also surface
//          whether the win rate came from real data. Add this near where you
//          compute histWinRate, then include `winRateSource` in the return:
// ----------------------------------------------------------------------------

//   const realRate = getRealWinRate(RFP_STATS, competitor.name, opportunity.segment)
//   const winRateSource = realRate !== null ? 'logged RFP outcomes' : 'estimated'
//   ... then add  winRateSource,  to the returned object

// ----------------------------------------------------------------------------
// STEP 5 — In App.jsx, after you load the RFP history, call loadRFPStats:
// ----------------------------------------------------------------------------

//   import { loadRFPStats } from './engine/scoringEngine'
//   ...
//   useEffect(() => {
//     fetch('./data/rfp_history.json?t=' + Date.now())
//       .then(r => r.ok ? r.json() : { rfps: [] })
//       .then(data => {
//         setRfpRecords(data.rfps || [])
//         loadRFPStats(data.rfps || [])   // <-- this makes predictions use real data
//       })
//       .catch(() => loadRFPStats([]))
//   }, [])
