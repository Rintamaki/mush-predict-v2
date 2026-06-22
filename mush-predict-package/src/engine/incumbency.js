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
 * Definitions:
 *   - "Repeat client" = same agency, 2+ contract awards
 *   - "Strong incumbent" = same agency, 3+ awards OR 2+ awards within last 36 months
 *   - "Likely renewal coming" = incumbent with award 18-36 months old (typical
 *      energy/HVAC contract cycle is 3-5 years, so we flag the window before
 *      renewal where positioning matters most)
 */

const RENEWAL_WINDOW_MIN_MONTHS = 18   // ignore very recent wins
const RENEWAL_WINDOW_MAX_MONTHS = 60   // and very old ones

function monthsAgo(dateStr) {
  if (!dateStr) return 999
  const then = new Date(dateStr)
  const now  = new Date()
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
}

/**
 * Normalize agency names so "Plano ISD" and "Plano Independent School District"
 * count as the same agency. This is fuzzy — agency naming in federal data is
 * inconsistent, so we strip common suffixes and lowercase for matching.
 */
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
 * Returns the incumbency profile for a competitor — which agencies they're
 * incumbent at, when their last win was, and where renewal opportunities
 * are likely brewing.
 */
export function computeIncumbencies(competitor) {
  const awards = [
    ...(competitor.contractAwards ?? []),
    ...(competitor.texasContracts ?? []),
  ]

  if (awards.length < 2) {
    return {
      total:                0,
      strongIncumbencies:   [],
      renewalsLikelyComing: [],
      byAgency:             {},
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

  // Find agencies with 2+ awards = incumbent
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

  // Strong incumbents — likely hardest to displace
  const strongIncumbencies = repeats.filter(r =>
    r.awardCount >= 3 || (r.awardCount >= 2 && r.monthsSinceLast < 36)
  )

  // Renewal-likely accounts — incumbents in the 18-60 month renewal window
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
 * Used by the scoring engine: returns an incumbency boost (0 to 0.3)
 * for a competitor against a given opportunity. If they're incumbent at
 * the same agency, they get a significant boost. If they're incumbent
 * at a similar agency (same state + segment), a smaller boost.
 */
export function getIncumbencyBoost(competitor, opportunity) {
  const incumbencies = computeIncumbencies(competitor)
  if (incumbencies.total === 0) return { boost: 0, reason: null }

  const oppAgencyKey = normalizeAgency(opportunity.agency)

  // Direct match — competitor is incumbent at this exact agency
  const directMatch = incumbencies.allRepeats?.find(r => r.key === oppAgencyKey)
  if (directMatch) {
    return {
      boost:  0.30,
      reason: `Incumbent at ${directMatch.agency} — ${directMatch.awardCount} prior wins, last ${directMatch.monthsSinceLast}mo ago`,
    }
  }

  // Same-state same-segment incumbencies — proxy signal
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
