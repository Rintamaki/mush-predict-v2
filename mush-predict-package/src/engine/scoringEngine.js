import { getIncumbencyBoost } from './incumbency'
import { computeWinStats, getRealWinRate, getStateWinRate } from './rfpDatabase'

let RFP_STATS = {}

export function loadRFPStats(rfpRecords) {
  RFP_STATS = computeWinStats(rfpRecords || [])
}

/**
 * scoringEngine.js
 *
 * Pure-function scoring engine. Takes a competitor profile and an
 * opportunity, returns explainable probability scores.
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

// ── SUB-SCORE 1: BEHAVIORAL FIT ───────────────────────────────────────────────
function computeBehavioralFit(competitor, opportunity) {
  const signals = []
  let score = 0

  const segmentWins = (competitor.contractAwards ?? []).filter(
    a => a.segment === opportunity.segment && monthsAgo(a.date) < 18
  )
  if (segmentWins.length) {
    const total = segmentWins.reduce((sum, a) => sum + (a.value ?? 0), 0)
    const recencyBoost = segmentWins.reduce((s, a) => s + recencyDecay(monthsAgo(a.date)), 0) / segmentWins.length
    const contribution = Math.min(0.45, (segmentWins.length / 6) * recencyBoost)
    score += contribution
    signals.push({
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
    signals.push({
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
    signals.push({
      label: `Named on ${recentPermits.length} building permits in last 12 months`,
      detail: recentPermits.slice(0, 2).map(p => p.location).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Socrata permits',
    })
  }

  const { boost, reason } = getIncumbencyBoost(competitor, opportunity)
  if (boost > 0) {
    score += boost
    signals.push({
      label:        'Incumbent or near-incumbent position',
      detail:       reason,
      contribution: +boost.toFixed(2),
      source:       'Contract award history',
    })
  }

  return { score: Math.min(1, score), signals }
}

// ── SUB-SCORE 2: GEOGRAPHIC FIT ───────────────────────────────────────────────
function computeGeographicFit(competitor, opportunity) {
  const signals = []
  let score = 0
  const oppState  = opportunity.state?.toUpperCase()
  const oppRegion = getRegion(oppState)

  const localOffices = (competitor.offices ?? []).filter(o => o.state === oppState)
  if (localOffices.length) {
    score += 0.50
    signals.push({
      label: `${localOffices.length} office${localOffices.length > 1 ? 's' : ''} in ${oppState}`,
      detail: localOffices.map(o => o.city).join(', '),
      contribution: 0.50,
      source: 'LinkedIn · Company website',
    })
  } else {
    const regionalOffices = (competitor.offices ?? []).filter(o => getRegion(o.state) === oppRegion)
    if (regionalOffices.length) {
      score += 0.25
      signals.push({
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
    signals.push({
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
    signals.push({
      label: `${localJobs.length} recent job postings in ${oppState}`,
      detail: localJobs.slice(0, 3).map(j => j.title).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Adzuna · LinkedIn Jobs',
    })
  }

  return { score: Math.min(1, score), signals }
}

// ── SUB-SCORE 3: SEGMENT FIT ──────────────────────────────────────────────────
function computeSegmentFit(competitor, opportunity) {
  const signals = []
  let score = 0
  const seg = opportunity.segment

  if ((competitor.segments ?? []).includes(seg)) {
    score += 0.30
    signals.push({
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
      signals.push({
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
    signals.push({
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
    signals.push({
      label: `${segJobs.length} ${seg}-focused job postings in last 6 months`,
      detail: segJobs.slice(0, 2).map(j => j.title).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Adzuna · LinkedIn Jobs',
    })
  }

  return { score: Math.min(1, score), signals }
}

// ── SUB-SCORE 4: STRATEGIC MOMENTUM ───────────────────────────────────────────
function computeStrategicMomentum(competitor, opportunity) {
  const signals = []
  let score = 0
  const seg = opportunity.segment

  const segMentions = (competitor.earningsCallMentions ?? []).filter(
    m => m.topic?.toLowerCase().includes(seg.toLowerCase()) && monthsAgo(m.quarter) < 12
  )
  if (segMentions.length) {
    const contribution = Math.min(0.35, segMentions.length * 0.10)
    score += contribution
    signals.push({
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
    signals.push({
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
    signals.push({
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
    signals.push({
      label: `${targetConferences.length} conference appearance${targetConferences.length > 1 ? 's' : ''} in target region`,
      detail: targetConferences.slice(0, 2).map(c => c.event).join('; '),
      contribution: +contribution.toFixed(2),
      source: 'Conference programs · Event scraping',
    })
  }

  return { score: Math.min(1, score), signals }
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
export function scoreCompetitorOpportunity(competitor, opportunity) {
  const behavioral = computeBehavioralFit(competitor, opportunity)
  const geographic = computeGeographicFit(competitor, opportunity)
  const segment    = computeSegmentFit(competitor, opportunity)
  const strategic  = computeStrategicMomentum(competitor, opportunity)

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
export function rankCompetitorsForOpportunity(competitors, opportunity) {
  return competitors
    .map(c => scoreCompetitorOpportunity(c, opportunity))
    .sort((a, b) => b.winLikelihood - a.winLikelihood)
}

// ── PREDICT NEXT MOVE ─────────────────────────────────────────────────────────
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