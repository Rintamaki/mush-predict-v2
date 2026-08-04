/**
 * incumbency.js
 *
 * Detects competitor incumbency patterns from contract award history.
 *
 * Incumbency matters because:
 *   1. Incumbents win renewals at much higher rates than challengers
 *   2. Agencies with a long-running incumbent are harder to displace
 *   3. Detecting incumbency tells AEs where to invest defense vs. offense
 *
 * SIGNALS-AWARE: computeIncumbencies now accepts an optional accumulated
 * `signals` array. When present, contract-type signals (which carry agency,
 * state, segment, and date) are folded in alongside the snapshot's
 * contractAwards/texasContracts — giving a fuller repeat-client picture than
 * today's snapshot alone. Falls back to snapshot-only when no signals given.
 */

const RENEWAL_WINDOW_MIN_MONTHS = 18
const RENEWAL_WINDOW_MAX_MONTHS = 60

function monthsAgo(dateStr) {
  if (!dateStr) return 999
  const then = new Date(dateStr)
  const now  = new Date()
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
}

function normalizeAgency(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/\b(independent school district|isd)\b/g, 'isd')
    .replace(/\b(university of|university)\b/g, 'univ')
    .replace(/\b(department of|dept of|department|dept)\b/g, 'dept')
    .replace(/\b(school district|district)\b/g, 'district')
    .replace(/\b(city of|town of)\b/g, '')
    .replace(/\b(county)\b/g, 'county')
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {Object} competitor  snapshot object (fallback + always folded in)
 * @param {Array}  signals     accumulated signals for this competitor (optional)
 */
export function computeIncumbencies(competitor, signals = []) {
  // Start from snapshot awards (always included)
  const awards = [
    ...(competitor.contractAwards ?? []),
    ...(competitor.texasContracts ?? []),
  ]

  // Fold in contract-type signals from accumulated history. Signals use
  // `timestamp` for date and may carry `agency`; only include ones that
  // actually name an agency (otherwise they can't indicate incumbency).
  if (signals && signals.length > 0) {
    signals
      .filter(s => s.type === 'contract' && s.agency)
      .forEach(s => {
        awards.push({
          agency:  s.agency,
          state:   s.state,
          segment: s.segment,
          date:    s.timestamp || s.date,
          value:   s.value ?? 0,
        })
      })
  }

  if (awards.length < 2) {
    return {
      total:                0,
      strongIncumbencies:   [],
      renewalsLikelyComing: [],
      byAgency:             {},
      allRepeats:           [],
    }
  }

  // Group by normalized agency name
  const byAgency = {}
  awards.forEach(a => {
    const key = normalizeAgency(a.agency)
    if (!key) return
    if (!byAgency[key]) {
      byAgency[key] = {
        displayName: a.agency,
        state:       a.state,
        segment:     a.segment,
        awards:      [],
      }
    }
    byAgency[key].awards.push(a)
  })

  // Dedupe awards within each agency by (date + value) so the same contract
  // appearing in both the snapshot and the accumulated signals isn't
  // double-counted as two separate wins.
  Object.values(byAgency).forEach(info => {
    const seen = new Set()
    info.awards = info.awards.filter(a => {
      const sig = `${a.date}|${a.value}`
      if (seen.has(sig)) return false
      seen.add(sig)
      return true
    })
  })

  const repeats = Object.entries(byAgency)
    .filter(([, info]) => info.awards.length >= 2)
    .map(([key, info]) => {
      const sortedAwards = [...info.awards].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      )
      const mostRecent  = sortedAwards[0]
      const oldest      = sortedAwards[sortedAwards.length - 1]
      const totalValue  = info.awards.reduce((s, a) => s + (a.value || 0), 0)
      const monthsSince = monthsAgo(mostRecent.date)
      return {
        key,
        agency:       info.displayName,
        state:        info.state,
        segment:      info.segment,
        awardCount:   info.awards.length,
        totalValue,
        mostRecent:   mostRecent.date,
        oldest:       oldest.date,
        monthsSinceLast: monthsSince,
        awards:       sortedAwards,
      }
    })
    .sort((a, b) => b.totalValue - a.totalValue)

  const strongIncumbencies = repeats.filter(r =>
    r.awardCount >= 3 || (r.awardCount >= 2 && r.monthsSinceLast < 36)
  )

  const renewalsLikelyComing = repeats.filter(r =>
    r.monthsSinceLast >= RENEWAL_WINDOW_MIN_MONTHS &&
    r.monthsSinceLast <= RENEWAL_WINDOW_MAX_MONTHS
  )

  return {
    total: repeats.length,
    strongIncumbencies,
    renewalsLikelyComing,
    byAgency,
    allRepeats: repeats,
  }
}

/**
 * Used by the scoring engine: returns an incumbency boost (0 to 0.3) for a
 * competitor against a given opportunity. Accepts optional signals so the
 * scoring engine can pass the same accumulated history through.
 */
export function getIncumbencyBoost(competitor, opportunity, signals = []) {
  const incumbencies = computeIncumbencies(competitor, signals)
  if (incumbencies.total === 0) return { boost: 0, reason: null }

  const oppAgencyKey = normalizeAgency(opportunity.agency)

  const directMatch = incumbencies.allRepeats?.find(r => r.key === oppAgencyKey)
  if (directMatch) {
    return {
      boost:  0.30,
      reason: `Incumbent at ${directMatch.agency} — ${directMatch.awardCount} prior wins, last ${directMatch.monthsSinceLast}mo ago`,
    }
  }

  const proximityMatches = incumbencies.allRepeats?.filter(r =>
    r.state === opportunity.state && r.segment === opportunity.segment
  ) ?? []

  if (proximityMatches.length) {
    return {
      boost:  Math.min(0.15, proximityMatches.length * 0.05),
      reason: `Incumbent at ${proximityMatches.length} similar ${opportunity.segment} account${proximityMatches.length > 1 ? 's' : ''} in ${opportunity.state}`,
    }
  }

  return { boost: 0, reason: null }
}
