import { getIncumbencyBoost } from './incumbency'
import { computeWinStats, getRealWinRate, getStateWinRate } from './rfpDatabase'

let RFP_STATS = {}

export function loadRFPStats(rfpRecords) {
  RFP_STATS = computeWinStats(rfpRecords || [])
}

/**
 * scoringEngine.js
 *
 * Pure-function scoring engine. Takes a competitor profile, an opportunity,
 * and (optionally) the accumulated signals array, and returns explainable
 * probability scores.
 *
 * SIGNALS INTEGRATION:
 * Each sub-score now also considers accumulated signals.json history for
 * that competitor, on top of the existing competitors.json snapshot data.
 * Signals are recency-decayed (30/90/180 day standard, matching the
 * Strategic Forecast engine) so recent activity counts more than old.
 * This is additive — snapshot-only behavior is unchanged when no signals
 * are passed in, so nothing breaks if a caller doesn't supply them.
 */

// ── WEIGHTS ───────────────────────────────────────────────────────────────────
export const DEFAULT_WEIGHTS = {
  behavioral:  0.40,
  geographic:  0.20,
  segment:     0.25,
  strategic:   0.15,
}

export let WEIGHTS = { ...DEFAULT_WEIGHTS }

export function setWeights(newWeights) {
  const sum = (newWeights.behavioral || 0) + (newWeights.geographic || 0) +
              (newWeights.segment || 0)    + (newWeights.strategic || 0)
  if (sum <= 0) {
    WEIGHTS = { ...DEFAULT_WEIGHTS }
  } else {
    WEIGHTS = {
      behavioral: (newWeights.behavioral || 0) / sum,
      geographic: (newWeights.geographic || 0) / sum,
      segment:    (newWeights.segment    || 0) / sum,
      strategic:  (newWeights.strategic  || 0) / sum,
    }
  }
  try { localStorage.setItem('mush-predict-weights', JSON.stringify(WEIGHTS)) } catch {}
}

export function resetWeights() {
  WEIGHTS = { ...DEFAULT_WEIGHTS }
  try { localStorage.removeItem('mush-predict-weights') } catch {}
}

export function loadSavedWeights() {
  try {
    const saved = localStorage.getItem('mush-predict-weights')
    if (saved) WEIGHTS = { ...DEFAULT_WEIGHTS, ...JSON.parse(saved) }
  } catch {}
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
const STATE_REGIONS = {
  PNW:        ['WA','OR','ID','MT','AK'],
  TX_SOUTH:   ['TX','OK','LA','AR','NM'],
  CALIFORNIA: ['CA','NV','AZ','HI'],
  MIDWEST:    ['IL','IN','OH','MI','WI','MN','IA','MO','KS','NE','SD','ND'],
  NORTHEAST:  ['NY','NJ','PA','MA','CT','RI','NH','VT','ME'],
  SOUTHEAST:  ['FL','GA','SC','NC','VA','WV','KY','TN','AL','MS'],
  MOUNTAIN:   ['CO','UT','WY'],
}

function getRegion(state) {
  for (const [region, states] of Object.entries(STATE_REGIONS)) {
    if (states.includes(state?.toUpperCase())) return region
  }
  return null
}

function monthsAgo(dateStr) {
  if (!dateStr) return 999
  const then = new Date(dateStr)
  const now  = new Date()
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
}

function recencyDecay(monthsOld) {
  if (monthsOld <= 6)  return 1.0
  if (monthsOld <= 12) return 0.75
  if (monthsOld <= 18) return 0.45
  if (monthsOld <= 24) return 0.20
  return 0.05
}

// ── SIGNALS HELPERS ────────────────────────────────────────────────────────────
// Standard 30/90/180 day decay, same as Strategic Forecast's signalsForecast.js
function daysAgo(timestamp) {
  if (!timestamp) return 9999
  try {
    const then = new Date(timestamp)
    if (isNaN(then)) return 9999
    return (Date.now() - then.getTime()) / 86400000
  } catch { return 9999 }
}

function signalDecay(days) {
  if (days <= 30)  return 1.0
  if (days <= 90)  return 0.5
  if (days <= 180) return 0.25
  return 0.1
}

/** Filter the full signals array down to just this competitor's signals. */
function signalsFor(signals, competitorName) {
  if (!signals?.length) return []
  return signals.filter(s => s.company === competitorName)
}

// ── SUB-SCORE 1: BEHAVIORAL FIT ───────────────────────────────────────────────
function computeBehavioralFit(competitor, opportunity, signals) {
  const sigs = []
  let score = 0

  const segmentWins = (competitor.contractAwards ?? []).filter(
    a => a.segment === opportunity.segment && monthsAgo(a.date) < 18
  )
  if (segmentWins.length) {
    const total = segmentWins.reduce((sum, a) => sum + (a.value ?? 0), 0)
    const recencyBoost = segmentWins.reduce((s, a) => s + recencyDecay(monthsAgo(a.date)), 0) / segmentWins.length
    const contribution = Math.min(0.45, (segmentWins.length / 6) * recencyBoost)
    score += contribution
    sigs.push({
      label: `${segmentWins.length} ${opportunity.segment} wins in last 18 months`,
      detail: `${segmentWins.length} contracts totaling $${(total/1e6).toFixed(1)}M`,
      contribution: +contribution.toFixed(2),
      source: 'USASpending.gov',
    })
  }

  const activeBids = (competitor.activeBids ?? []).filter(
    b => b.segment === opportunity.segment || (b.keywords ?? []).some(k => opportunity.keywords?.includes(k))
  )
  if (activeBids.length) {
    const contribution = Math.min(0.30, activeBids.length * 0.10)
    score += contribution
    sigs.push({
      label: `${activeBids.length} similar bids active right now`,
      detail: activeBids.map(b => b.title).slice(0, 2).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'SAM.gov · BidNet',
    })
  }

  const recentPermits = (competitor.permitMentions ?? []).filter(p => monthsAgo(p.date) < 12)
  if (recentPermits.length) {
    const contribution = Math.min(0.25, recentPermits.length * 0.08)
    score += contribution
    sigs.push({
      label: `Named on ${recentPermits.length} building permits in last 12 months`,
      detail: recentPermits.slice(0, 2).map(p => p.location).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Socrata permits',
    })
  }

  const { boost, reason } = getIncumbencyBoost(competitor, opportunity)
  if (boost > 0) {
    score += boost
    sigs.push({
      label:        'Incumbent or near-incumbent position',
      detail:       reason,
      contribution: +boost.toFixed(2),
      source:       'Contract award history',
    })
  }

  // ── SIGNALS: accumulated bid/contract/job momentum for this competitor,
  //    in this exact state + segment, recency-decayed. Capped so it can't
  //    dwarf the snapshot-based contributions above.
  const compSignals = signalsFor(signals, competitor.name)
  const oppState = opportunity.state?.toUpperCase()
  const relevantMomentum = compSignals.filter(s =>
    (s.type === 'contract' || s.type === 'bid' || s.type === 'job') &&
    s.state?.toUpperCase() === oppState
  )
  if (relevantMomentum.length) {
    const weighted = relevantMomentum.reduce((sum, s) => {
      const typeW = s.type === 'contract' ? 1.0 : s.type === 'bid' ? 0.8 : 0.5
      return sum + signalDecay(daysAgo(s.timestamp)) * typeW
    }, 0)
    const contribution = Math.min(0.20, weighted * 0.05)
    const recentCount = relevantMomentum.filter(s => daysAgo(s.timestamp) <= 30).length
    score += contribution
    sigs.push({
      label: `${relevantMomentum.length} accumulated signals in ${oppState} (${recentCount} in last 30 days)`,
      detail: `Recency-weighted momentum from contracts, bids, and jobs history`,
      contribution: +contribution.toFixed(2),
      source: 'Accumulated signal history',
    })
  }

  return { score: Math.min(1, score), signals: sigs }
}

// ── SUB-SCORE 2: GEOGRAPHIC FIT ───────────────────────────────────────────────
function computeGeographicFit(competitor, opportunity, signals) {
  const sigs = []
  let score = 0
  const oppState  = opportunity.state?.toUpperCase()
  const oppRegion = getRegion(oppState)

  const localOffices = (competitor.offices ?? []).filter(o => o.state === oppState)
  if (localOffices.length) {
    score += 0.50
    sigs.push({
      label: `${localOffices.length} office${localOffices.length > 1 ? 's' : ''} in ${oppState}`,
      detail: localOffices.map(o => o.city).join(', '),
      contribution: 0.50,
      source: 'LinkedIn · Company website',
    })
  } else {
    const regionalOffices = (competitor.offices ?? []).filter(o => getRegion(o.state) === oppRegion)
    if (regionalOffices.length) {
      score += 0.25
      sigs.push({
        label: `${regionalOffices.length} office${regionalOffices.length > 1 ? 's' : ''} in ${oppRegion} region (no in-state)`,
        detail: regionalOffices.map(o => `${o.city}, ${o.state}`).join(', '),
        contribution: 0.25,
        source: 'LinkedIn · Company website',
      })
    }
  }

  const stateWins = (competitor.contractAwards ?? []).filter(a => a.state === oppState)
  if (stateWins.length) {
    const contribution = Math.min(0.35, stateWins.length * 0.07)
    score += contribution
    sigs.push({
      label: `${stateWins.length} historical wins in ${oppState}`,
      detail: `Total: $${(stateWins.reduce((s, a) => s + (a.value ?? 0), 0) / 1e6).toFixed(1)}M`,
      contribution: +contribution.toFixed(2),
      source: 'USASpending.gov',
    })
  }

  const localJobs = (competitor.jobPostings ?? []).filter(j => j.state === oppState && monthsAgo(j.postedDate) < 6)
  if (localJobs.length) {
    const contribution = Math.min(0.20, localJobs.length * 0.04)
    score += contribution
    sigs.push({
      label: `${localJobs.length} recent job postings in ${oppState}`,
      detail: localJobs.slice(0, 3).map(j => j.title).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Adzuna · LinkedIn Jobs',
    })
  }

  // ── SIGNALS: accumulated presence in this state beyond today's snapshot —
  //    catches sustained activity a single day's data would miss.
  const compSignals = signalsFor(signals, competitor.name)
  const stateSignals = compSignals.filter(s => s.state?.toUpperCase() === oppState)
  if (stateSignals.length >= 5) {  // only meaningful once there's real history
    const weighted = stateSignals.reduce((sum, s) => sum + signalDecay(daysAgo(s.timestamp)), 0)
    const contribution = Math.min(0.15, weighted * 0.015)
    score += contribution
    sigs.push({
      label: `${stateSignals.length} accumulated signals show sustained ${oppState} presence`,
      detail: `Includes jobs, contracts, bids, and news across accumulated history`,
      contribution: +contribution.toFixed(2),
      source: 'Accumulated signal history',
    })
  }

  return { score: Math.min(1, score), signals: sigs }
}

// ── SUB-SCORE 3: SEGMENT FIT ──────────────────────────────────────────────────
function computeSegmentFit(competitor, opportunity, signals) {
  const sigs = []
  let score = 0
  const seg = opportunity.segment

  if ((competitor.segments ?? []).includes(seg)) {
    score += 0.30
    sigs.push({
      label: `${seg} is a stated competitor segment`,
      detail: `Competes in: ${(competitor.segments ?? []).join(', ')}`,
      contribution: 0.30,
      source: 'Company website · 10-K',
    })
  }

  const allWins = competitor.contractAwards ?? []
  if (allWins.length) {
    const segWins = allWins.filter(a => a.segment === seg)
    const segPct = segWins.length / allWins.length
    const contribution = Math.min(0.40, segPct * 0.8)
    if (segPct > 0.05) {
      score += contribution
      sigs.push({
        label: `${seg} = ${(segPct * 100).toFixed(0)}% of historical wins`,
        detail: `${segWins.length} of ${allWins.length} tracked contracts`,
        contribution: +contribution.toFixed(2),
        source: 'USASpending.gov',
      })
    }
  }

  const segPatents = (competitor.patents ?? []).filter(
    p => (p.tags ?? []).some(t => t.toLowerCase().includes(seg.toLowerCase())) && monthsAgo(p.date) < 24
  )
  if (segPatents.length) {
    const contribution = Math.min(0.20, segPatents.length * 0.05)
    score += contribution
    sigs.push({
      label: `${segPatents.length} patent filings in ${seg} in last 24 months`,
      detail: segPatents.slice(0, 2).map(p => p.title).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'USPTO',
    })
  }

  const segJobs = (competitor.jobPostings ?? []).filter(
    j => (j.segment === seg || (j.tags ?? []).includes(seg)) && monthsAgo(j.postedDate) < 6
  )
  if (segJobs.length >= 2) {
    const contribution = Math.min(0.15, segJobs.length * 0.03)
    score += contribution
    sigs.push({
      label: `${segJobs.length} ${seg}-focused job postings in last 6 months`,
      detail: segJobs.slice(0, 2).map(j => j.title).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Adzuna · LinkedIn Jobs',
    })
  }

  // ── SIGNALS: accumulated segment-tagged activity — catches segment focus
  //    that today's snapshot alone wouldn't show enough volume to register.
  const compSignals = signalsFor(signals, competitor.name)
  const segSignals = compSignals.filter(s => s.segment === seg)
  if (segSignals.length >= 5) {
    const weighted = segSignals.reduce((sum, s) => sum + signalDecay(daysAgo(s.timestamp)), 0)
    const contribution = Math.min(0.15, weighted * 0.012)
    score += contribution
    sigs.push({
      label: `${segSignals.length} accumulated ${seg} signals over time`,
      detail: `Sustained segment focus visible across signal history`,
      contribution: +contribution.toFixed(2),
      source: 'Accumulated signal history',
    })
  }

  return { score: Math.min(1, score), signals: sigs }
}

// ── SUB-SCORE 4: STRATEGIC MOMENTUM ───────────────────────────────────────────
function computeStrategicMomentum(competitor, opportunity, signals) {
  const sigs = []
  let score = 0
  const seg = opportunity.segment

  const segMentions = (competitor.earningsCallMentions ?? []).filter(
    m => m.topic?.toLowerCase().includes(seg.toLowerCase()) && monthsAgo(m.quarter) < 12
  )
  if (segMentions.length) {
    const contribution = Math.min(0.35, segMentions.length * 0.10)
    score += contribution
    sigs.push({
      label: `Mentioned ${seg} on ${segMentions.length} earnings call${segMentions.length > 1 ? 's' : ''}`,
      detail: segMentions.slice(0, 2).map(m => `${m.quarter}: "${m.snippet}"`).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'SEC EDGAR · Earnings transcripts',
    })
  }

  const recentExecMoves = (competitor.executiveMoves ?? []).filter(
    m => monthsAgo(m.date) < 9 && (
      m.title?.toLowerCase().includes(seg.toLowerCase()) ||
      m.title?.toLowerCase().includes(opportunity.state?.toLowerCase() ?? '')
    )
  )
  if (recentExecMoves.length) {
    const contribution = Math.min(0.25, recentExecMoves.length * 0.10)
    score += contribution
    sigs.push({
      label: `${recentExecMoves.length} relevant executive hire${recentExecMoves.length > 1 ? 's' : ''} in last 9 months`,
      detail: recentExecMoves.slice(0, 2).map(m => `${m.name} — ${m.title}`).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'LinkedIn · Press releases',
    })
  }

  const segLobbying = (competitor.lobbyingActivity ?? []).filter(
    l => (l.topics ?? []).some(t => t.toLowerCase().includes(seg.toLowerCase())) && monthsAgo(l.date) < 12
  )
  if (segLobbying.length) {
    const contribution = Math.min(0.20, segLobbying.length * 0.08)
    score += contribution
    sigs.push({
      label: `${segLobbying.length} lobbying disclosures touching ${seg}`,
      detail: segLobbying[0]?.bills?.slice(0, 2).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Senate LDA · House LDA',
    })
  }

  const targetConferences = (competitor.conferences ?? []).filter(
    c => c.state === opportunity.state?.toUpperCase() && monthsAgo(c.date) < 9
  )
  if (targetConferences.length) {
    const contribution = Math.min(0.20, targetConferences.length * 0.07)
    score += contribution
    sigs.push({
      label: `${targetConferences.length} conference appearance${targetConferences.length > 1 ? 's' : ''} in target region`,
      detail: targetConferences.slice(0, 2).map(c => c.event).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Conference programs · Event scraping',
    })
  }

  // ── SIGNALS: recent news volume mentioning this competitor — a rough
  //    proxy for "how active/visible are they right now" that the daily
  //    snapshot (usually 1-4 news articles) can't capture well on its own.
  const compSignals = signalsFor(signals, competitor.name)
  const recentNews = compSignals.filter(s => s.type === 'news' && daysAgo(s.timestamp) <= 90)
  if (recentNews.length >= 3) {
    const weighted = recentNews.reduce((sum, s) => sum + signalDecay(daysAgo(s.timestamp)), 0)
    const contribution = Math.min(0.15, weighted * 0.03)
    score += contribution
    sigs.push({
      label: `${recentNews.length} news mentions in last 90 days`,
      detail: `Elevated media/market visibility relative to baseline`,
      contribution: +contribution.toFixed(2),
      source: 'Accumulated signal history',
    })
  }

  return { score: Math.min(1, score), signals: sigs }
}

// ── HISTORICAL WIN RATE ───────────────────────────────────────────────────────
function computeHistoricalWinRate(competitor, opportunity) {
  const realRate = getRealWinRate(RFP_STATS, competitor.name, opportunity.segment)
  if (realRate !== null) return realRate

  const wins = competitor.contractAwards ?? []
  const bids = competitor.historicalBids ?? []
  const segBids = bids.filter(b => b.segment === opportunity.segment)
  const segWins = wins.filter(w => w.segment === opportunity.segment)

  if (segBids.length < 3) {
    if (bids.length >= 5) return wins.length / bids.length
    return 0.32
  }
  return Math.min(0.85, segWins.length / segBids.length)
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────
/**
 * @param {Object} competitor
 * @param {Object} opportunity
 * @param {Array}  signals  — optional, accumulated signals.json array.
 *                            If omitted, behaves exactly as before (snapshot-only).
 */
export function scoreCompetitorOpportunity(competitor, opportunity, signals = []) {
  const behavioral = computeBehavioralFit(competitor, opportunity, signals)
  const geographic = computeGeographicFit(competitor, opportunity, signals)
  const segment    = computeSegmentFit(competitor, opportunity, signals)
  const strategic  = computeStrategicMomentum(competitor, opportunity, signals)

  const pursuitLikelihood =
      WEIGHTS.behavioral * behavioral.score
    + WEIGHTS.geographic * geographic.score
    + WEIGHTS.segment    * segment.score
    + WEIGHTS.strategic  * strategic.score

  const histWinRate = computeHistoricalWinRate(competitor, opportunity)

  const recencyMultiplier = 0.85 + (strategic.score * 0.30)
  const winLikelihood = pursuitLikelihood * histWinRate * recencyMultiplier

  const totalSignals =
    behavioral.signals.length + geographic.signals.length +
    segment.signals.length + strategic.signals.length
  const confidence = Math.min(1, totalSignals / 8)

  // How many of the signal entries actually came from accumulated history
  // vs. today's snapshot — surfaced so the UI/audit trail can show it.
  const signalDrivenCount = [
    ...behavioral.signals, ...geographic.signals, ...segment.signals, ...strategic.signals,
  ].filter(s => s.source === 'Accumulated signal history').length

  const trace = {
    inputs: {
      opportunity: {
        title:   opportunity.title,
        agency:  opportunity.agency,
        state:   opportunity.state,
        segment: opportunity.segment,
        value:   opportunity.value,
      },
      weights: { ...WEIGHTS },
    },
    steps: [
      { name: 'Behavioral fit',     rawScore: +behavioral.score.toFixed(3), weight: WEIGHTS.behavioral, weighted: +(WEIGHTS.behavioral * behavioral.score).toFixed(3), signalCount: behavioral.signals.length, signals: behavioral.signals },
      { name: 'Geographic fit',     rawScore: +geographic.score.toFixed(3), weight: WEIGHTS.geographic, weighted: +(WEIGHTS.geographic * geographic.score).toFixed(3), signalCount: geographic.signals.length, signals: geographic.signals },
      { name: 'Segment fit',        rawScore: +segment.score.toFixed(3),    weight: WEIGHTS.segment,    weighted: +(WEIGHTS.segment    * segment.score).toFixed(3),    signalCount: segment.signals.length,    signals: segment.signals    },
      { name: 'Strategic momentum', rawScore: +strategic.score.toFixed(3),  weight: WEIGHTS.strategic,  weighted: +(WEIGHTS.strategic  * strategic.score).toFixed(3),  signalCount: strategic.signals.length,  signals: strategic.signals  },
    ],
    pursuitFormula: `${WEIGHTS.behavioral.toFixed(2)}×${behavioral.score.toFixed(2)} + ${WEIGHTS.geographic.toFixed(2)}×${geographic.score.toFixed(2)} + ${WEIGHTS.segment.toFixed(2)}×${segment.score.toFixed(2)} + ${WEIGHTS.strategic.toFixed(2)}×${strategic.score.toFixed(2)} = ${pursuitLikelihood.toFixed(3)}`,
    winFormula:     `pursuit(${pursuitLikelihood.toFixed(3)}) × winRate(${histWinRate.toFixed(2)}) × recency(${recencyMultiplier.toFixed(2)}) = ${winLikelihood.toFixed(3)}`,
    winRateSource:  getRealWinRate(RFP_STATS, competitor.name, opportunity.segment) !== null ? 'real RFP outcomes' : 'estimated from federal contracts',
    signalsUsed:    signals?.length ?? 0,
    signalDrivenContributions: signalDrivenCount,
  }

  return {
    competitor:        competitor.name,
    pursuitLikelihood: +Math.min(1, pursuitLikelihood).toFixed(3),
    winLikelihood:     +Math.min(1, winLikelihood).toFixed(3),
    confidence:        +confidence.toFixed(2),
    historicalWinRate: +histWinRate.toFixed(2),
    subScores: {
      behavioral: { ...behavioral, weight: WEIGHTS.behavioral, label: 'Behavioral fit' },
      geographic: { ...geographic, weight: WEIGHTS.geographic, label: 'Geographic fit' },
      segment:    { ...segment,    weight: WEIGHTS.segment,    label: 'Segment fit'    },
      strategic:  { ...strategic,  weight: WEIGHTS.strategic,  label: 'Strategic momentum' },
    },
    allSignals: [
      ...behavioral.signals.map(s => ({ ...s, category: 'Behavioral' })),
      ...geographic.signals.map(s => ({ ...s, category: 'Geographic' })),
      ...segment.signals.map(s    => ({ ...s, category: 'Segment'    })),
      ...strategic.signals.map(s  => ({ ...s, category: 'Strategic'  })),
    ],
    trace,
  }
}

// ── RANK ALL COMPETITORS AGAINST ONE OPPORTUNITY ──────────────────────────────
/**
 * @param {Array} competitors
 * @param {Object} opportunity
 * @param {Array} signals — optional, same as scoreCompetitorOpportunity
 */
export function rankCompetitorsForOpportunity(competitors, opportunity, signals = []) {
  return competitors
    .map(c => scoreCompetitorOpportunity(c, opportunity, signals))
    .sort((a, b) => b.winLikelihood - a.winLikelihood)
}

// ── PREDICT NEXT MOVE (legacy — superseded by signalsForecast.js) ────────────
// Kept for backward compatibility only. Strategic Forecast now uses
// forecastFromSignals() in signalsForecast.js instead of this function.
export function predictNextMove(competitor) {
  const moves    = []
  const segments = ['Municipal', 'University', 'Schools', 'Healthcare']
  const states   = ['TX', 'WA', 'OR', 'CA', 'CO', 'IL', 'NY', 'FL']

  for (const seg of segments) {
    for (const state of states) {
      const score =
        ((competitor.jobPostings ?? []).filter(j =>
          j.state === state &&
          (j.segment === seg || (j.tags ?? []).includes(seg)) &&
          monthsAgo(j.postedDate) < 6
        ).length * 0.25) +
        ((competitor.activeBids ?? []).filter(b =>
          b.state === state && b.segment === seg
        ).length * 0.30) +
        ((competitor.contractAwards ?? []).filter(a =>
          a.state === state && a.segment === seg && monthsAgo(a.date) < 24
        ).length * 0.20) +
        ((competitor.texasContracts ?? []).filter(a =>
          a.state === state && a.segment === seg
        ).length * 0.20) +
        ((competitor.earningsCallMentions ?? []).filter(m =>
          m.topic?.includes(seg) && monthsAgo(m.quarter) < 12
        ).length * 0.15) +
        ((competitor.executiveMoves ?? []).filter(m =>
          monthsAgo(m.date) < 9 &&
          (m.title?.includes(seg) || m.title?.includes(state))
        ).length * 0.15) +
        ((competitor.permitMentions ?? []).filter(p =>
          p.state === state && monthsAgo(p.date) < 9
        ).length * 0.10)

      if (score > 0.05) {
        moves.push({
          segment:     seg,
          state,
          score:       +score.toFixed(2),
          probability: Math.min(0.95, score / 2.0),
        })
      }
    }
  }

  if (moves.length === 0) {
    const awards = competitor.contractAwards ?? []
    const segCounts = {}
    awards.forEach(a => {
      if (a.segment && a.segment !== 'Other') {
        segCounts[a.segment] = (segCounts[a.segment] || 0) + 1
      }
    })
    Object.entries(segCounts).forEach(([seg, count]) => {
      moves.push({
        segment:     seg,
        state:       'Multiple',
        score:       +(count * 0.1).toFixed(2),
        probability: Math.min(0.60, count * 0.08),
      })
    })
  }

  return moves.sort((a, b) => b.score - a.score).slice(0, 5)
}
