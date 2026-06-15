/**
 * rfpDatabase.js
 *
 * Manages the historical RFP outcome records and turns them into
 * real win-rate statistics that feed the prediction engine.
 *
 * Records are stored in public/data/rfp_history.json (committed to repo)
 * with this shape per record:
 *   {
 *     id, title, agency, state, segment, value,
 *     winner, losingBidders: [], awardDate, sourceFile
 *   }
 */

/**
 * Compute real win/bid statistics per competitor from the RFP history.
 * Returns a map: { [competitorName]: { bids, wins, byState, bySegment } }
 */
export function computeWinStats(rfpRecords) {
  const stats = {}

  function ensure(name) {
    if (!stats[name]) {
      stats[name] = {
        bids: 0,
        wins: 0,
        byState:   {},   // { TX: { bids, wins } }
        bySegment: {},   // { Schools: { bids, wins } }
        recentWins: [],  // [{ date, value, state, segment, agency }]
      }
    }
    return stats[name]
  }

  for (const rfp of rfpRecords) {
    // Everyone who bid (winner + losers) gets a bid counted
    const allBidders = [rfp.winner, ...(rfp.losingBidders ?? [])].filter(Boolean)

    for (const bidder of allBidders) {
      const s = ensure(bidder)
      s.bids++
      // Per-state
      if (rfp.state) {
        s.byState[rfp.state] = s.byState[rfp.state] || { bids: 0, wins: 0 }
        s.byState[rfp.state].bids++
      }
      // Per-segment
      if (rfp.segment) {
        s.bySegment[rfp.segment] = s.bySegment[rfp.segment] || { bids: 0, wins: 0 }
        s.bySegment[rfp.segment].bids++
      }
    }

    // The winner gets a win counted
    if (rfp.winner) {
      const s = ensure(rfp.winner)
      s.wins++
      if (rfp.state && s.byState[rfp.state]) s.byState[rfp.state].wins++
      if (rfp.segment && s.bySegment[rfp.segment]) s.bySegment[rfp.segment].wins++
      s.recentWins.push({
        date:    rfp.awardDate,
        value:   rfp.value,
        state:   rfp.state,
        segment: rfp.segment,
        agency:  rfp.agency,
      })
    }
  }

  return stats
}

/**
 * Get a competitor's real win rate for a given segment, from logged RFPs.
 * Returns null if there isn't enough data (so the engine can fall back
 * to its estimate).
 */
export function getRealWinRate(stats, competitorName, segment) {
  const s = stats[competitorName]
  if (!s) return null

  // Prefer segment-specific rate if we have enough bids
  if (segment && s.bySegment[segment] && s.bySegment[segment].bids >= 3) {
    return s.bySegment[segment].wins / s.bySegment[segment].bids
  }
  // Fall back to overall rate if enough total bids
  if (s.bids >= 5) {
    return s.wins / s.bids
  }
  return null  // not enough data — let engine use its estimate
}

/**
 * Get a competitor's real win rate in a specific state.
 */
export function getStateWinRate(stats, competitorName, state) {
  const s = stats[competitorName]
  if (!s || !state || !s.byState[state]) return null
  const st = s.byState[state]
  if (st.bids < 3) return null
  return st.wins / st.bids
}

/**
 * Filter/search RFP records for the reference database view.
 */
export function searchRFPs(rfpRecords, { query = '', segment = '', state = '', winner = '' } = {}) {
  return rfpRecords.filter(r => {
    const matchQuery   = !query   || [r.title, r.agency, r.winner, ...(r.losingBidders ?? [])]
                          .join(' ').toLowerCase().includes(query.toLowerCase())
    const matchSegment = !segment || r.segment === segment
    const matchState   = !state   || r.state === state
    const matchWinner  = !winner  || r.winner === winner
    return matchQuery && matchSegment && matchState && matchWinner
  })
}

/**
 * Generate a unique ID for a new RFP record.
 */
export function makeRFPId() {
  return 'rfp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
