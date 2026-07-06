/**
 * briefGenerator.js
 *
 * Assembles a pre-call brief for an AE from all available data:
 *   - Competitor scoring (via rankCompetitorsForOpportunity)
 *   - Incumbency detection (via computeIncumbencies)
 *   - Recent signals for the target state/segment
 *   - District enrichment (if K-12 and available)
 *   - McKinstry's own historical position (from RFP database)
 *
 * The output is a structured object. The rendering component decides how
 * to display each section.
 *
 * Designed for a future AI-powered upgrade: `generateBrief` returns
 * structured data, and the display component templates the narrative.
 * When the Anthropic key lands, we replace `buildTalkingPoints()` with
 * an API call that synthesizes richer narrative from the same inputs.
 */

import { rankCompetitorsForOpportunity } from './scoringEngine'
import { computeIncumbencies } from './incumbency'

/**
 * Main entry point. Takes an opportunity + all data sources, returns
 * a structured brief object.
 */
export function generateBrief({
  opportunity,           // { agency, state, segment, value, title }
  meetingContext,        // { rfpTitle, myRole, meetingPurpose }
  competitors,           // full competitor array from competitors.json
  signals,               // full signals array from signals.json
  districtProfile,       // optional NCES data, only for K-12
  rfpHistory,            // optional array of logged McKinstry RFPs
}) {
  // 1. Score all competitors against this opportunity
  const rankedCompetitors = rankCompetitorsForOpportunity(competitors, opportunity)

  // 2. Identify the top 3 most likely competitors on this pursuit
  const topCompetitors = rankedCompetitors.slice(0, 3)

  // 3. Look for incumbency across all competitors at this specific agency
  const incumbents = findIncumbentsAtAgency(competitors, opportunity.agency)

  // 4. Find recent signals relevant to this account
  const relevantSignals = filterRelevantSignals(signals, opportunity)

  // 5. Check if McKinstry has history with this agency
  const mckinstryHistory = findMcKinstryHistory(rfpHistory, opportunity)

  // 6. Build talking points based on all of the above
  const talkingPoints = buildTalkingPoints({
    opportunity,
    meetingContext,
    topCompetitors,
    incumbents,
    relevantSignals,
    mckinstryHistory,
    districtProfile,
  })

  // 7. Build watch-outs (things to be careful about)
  const watchOuts = buildWatchOuts({
    opportunity,
    topCompetitors,
    incumbents,
    relevantSignals,
  })

  // 8. Build questions to ask
  const questions = buildQuestionsToAsk({
    opportunity,
    meetingContext,
    incumbents,
    districtProfile,
  })

  return {
    generatedAt:    new Date().toISOString(),
    opportunity,
    meetingContext,
    topCompetitors,
    incumbents,
    relevantSignals: relevantSignals.slice(0, 8),
    mckinstryHistory,
    districtProfile,
    talkingPoints,
    watchOuts,
    questions,
  }
}

// ── Incumbency at a specific agency ───────────────────────────────────────────
function findIncumbentsAtAgency(competitors, agency) {
  if (!agency) return []
  const result = []
  const normAgency = normalizeAgency(agency)
  competitors.forEach(comp => {
    const incumbencies = computeIncumbencies(comp)
    const match = incumbencies.allRepeats?.find(
      r => normalizeAgency(r.agency).includes(normAgency) || normAgency.includes(normalizeAgency(r.agency))
    )
    if (match) {
      result.push({
        competitor:   comp.name,
        awardCount:   match.awardCount,
        totalValue:   match.totalValue,
        monthsSinceLast: match.monthsSinceLast,
        renewalWindow: match.monthsSinceLast >= 18 && match.monthsSinceLast <= 60,
      })
    }
  })
  return result.sort((a, b) => b.awardCount - a.awardCount)
}

function normalizeAgency(name) {
  if (!name) return ''
  return name.toLowerCase()
    .replace(/\b(independent school district|isd)\b/g, 'isd')
    .replace(/\b(university of|university)\b/g, 'univ')
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ').trim()
}

// ── Filter signals relevant to this opportunity ───────────────────────────────
function filterRelevantSignals(signals, opportunity) {
  if (!signals?.length) return []
  const oppState = opportunity.state?.toUpperCase()

  return signals
    .filter(s => {
      // Same state
      if (s.state && s.state.toUpperCase() === oppState) return true
      // Same segment mentioned
      if (s.segment && opportunity.segment && s.segment === opportunity.segment) return true
      // News related to competitor is always potentially useful
      if (s.type === 'news') return true
      return false
    })
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
}

// ── Check McKinstry pursuit history at this agency ────────────────────────────
function findMcKinstryHistory(rfpHistory, opportunity) {
  if (!rfpHistory?.length) return null
  const normAgency = normalizeAgency(opportunity.agency)
  const matches = rfpHistory.filter(
    r => normalizeAgency(r.agency).includes(normAgency) || normAgency.includes(normalizeAgency(r.agency))
  )
  if (!matches.length) return null
  const wins = matches.filter(r => r.outcome === 'won')
  const losses = matches.filter(r => r.outcome === 'lost')
  return {
    total: matches.length,
    wins: wins.length,
    losses: losses.length,
    mostRecent: matches[0],
    winRate: matches.length > 0 ? wins.length / matches.length : 0,
  }
}

// ── Build talking points ──────────────────────────────────────────────────────
// This is the section AI will improve dramatically when the Anthropic key
// lands. For now: rules-based templates that pull from the signal data.
function buildTalkingPoints({
  opportunity,
  meetingContext,
  topCompetitors,
  incumbents,
  relevantSignals,
  mckinstryHistory,
  districtProfile,
}) {
  const points = []

  // District scale talking point
  if (districtProfile?.enrollment?.total) {
    const enrollment = districtProfile.enrollment.total
    const spend = districtProfile.finance?.perPupilExpenditure
    if (spend) {
      const budget = (enrollment * spend / 1e6).toFixed(0)
      points.push({
        category: 'Account scale',
        point: `${opportunity.agency} serves ${enrollment.toLocaleString()} students across ${districtProfile.schoolsCount || '?'} schools with an estimated $${budget}M annual operating budget — position solutions at scale.`,
      })
    }
  }

  // McKinstry's history at this agency
  if (mckinstryHistory) {
    if (mckinstryHistory.wins > 0) {
      points.push({
        category: 'Prior relationship',
        point: `McKinstry has ${mckinstryHistory.wins} prior win${mckinstryHistory.wins > 1 ? 's' : ''} at ${opportunity.agency}. Lean into the relationship — reference specific past project outcomes.`,
      })
    } else if (mckinstryHistory.losses > 0) {
      points.push({
        category: 'Prior relationship',
        point: `McKinstry has pursued ${opportunity.agency} ${mckinstryHistory.total} time${mckinstryHistory.total > 1 ? 's' : ''} without winning. Ask what they wanted from previous vendors that they didn't get.`,
      })
    }
  }

  // Incumbency
  if (incumbents.length > 0) {
    const top = incumbents[0]
    if (top.renewalWindow) {
      points.push({
        category: 'Displacement opportunity',
        point: `${top.competitor} is the incumbent (${top.awardCount} prior wins) but their last contract was ${top.monthsSinceLast} months ago — this is likely a renewal window. Position around what they haven't delivered.`,
      })
    } else if (top.monthsSinceLast < 18) {
      points.push({
        category: 'Incumbent risk',
        point: `${top.competitor} won here ${top.monthsSinceLast} months ago and has ${top.awardCount} prior wins. Displacement will be hard — consider positioning around specific gaps or new scope.`,
      })
    }
  }

  // Top competitor context
  if (topCompetitors.length) {
    const top = topCompetitors[0]
    if (top.winLikelihood >= 0.4) {
      points.push({
        category: 'Primary competitor',
        point: `Highest-likelihood competitor: ${top.competitor} (${(top.winLikelihood * 100).toFixed(0)}% win probability by our model). Their recent signal: ${top.recentSignalSummary || 'active in segment'}.`,
      })
    }
  }

  // Signal-driven insights
  const competitorContractsThisState = relevantSignals.filter(
    s => s.type === 'contract' && s.state?.toUpperCase() === opportunity.state?.toUpperCase()
  ).slice(0, 3)
  if (competitorContractsThisState.length) {
    points.push({
      category: 'Market activity',
      point: `Recent competitor contract wins in ${opportunity.state}: ${competitorContractsThisState.map(s => `${s.company} (${s.timestamp?.slice(0, 7) || 'recent'})`).join(', ')}. Acknowledge market activity honestly.`,
    })
  }

  // Hiring signals suggest competitor is investing
  const competitorHiring = relevantSignals.filter(
    s => s.type === 'job' && s.state?.toUpperCase() === opportunity.state?.toUpperCase()
  )
  if (competitorHiring.length >= 5) {
    const topHirer = mostFrequent(competitorHiring.map(s => s.company))
    if (topHirer) {
      points.push({
        category: 'Market signal',
        point: `${topHirer} has been hiring aggressively in ${opportunity.state} (${competitorHiring.filter(s => s.company === topHirer).length} recent postings) — expect them to compete hard here.`,
      })
    }
  }

  // Meeting-specific angle
  if (meetingContext?.meetingPurpose) {
    points.push({
      category: 'Meeting focus',
      point: `Purpose: ${meetingContext.meetingPurpose}. Frame McKinstry's approach around outcomes, not features. Have 2-3 comparable public sector case studies ready.`,
    })
  }

  return points
}

// ── Build watch-outs ──────────────────────────────────────────────────────────
function buildWatchOuts({ opportunity, topCompetitors, incumbents, relevantSignals }) {
  const watchOuts = []

  if (incumbents.length > 0 && incumbents[0].monthsSinceLast < 12) {
    watchOuts.push(`Fresh incumbent (${incumbents[0].competitor}) — expect strong sole-source or "trust the current vendor" pressure. Don't disparage; acknowledge and differentiate.`)
  }

  if (topCompetitors.length && topCompetitors[0].winLikelihood > 0.6) {
    watchOuts.push(`Our model gives ${topCompetitors[0].competitor} a ${(topCompetitors[0].winLikelihood * 100).toFixed(0)}% win probability. Assume they'll present strong — don't be caught flat-footed on their differentiators.`)
  }

  if (opportunity.value && opportunity.value < 500000) {
    watchOuts.push(`Deal size is under $500K — smaller ESCOs and regional players will underbid on price. Compete on partnership, not cost.`)
  }

  if (opportunity.value && opportunity.value > 20000000) {
    watchOuts.push(`Large deal ($${(opportunity.value / 1e6).toFixed(0)}M+) — JCI, Trane, Schneider, and Siemens will show up. Position around delivery certainty and past performance at similar scale.`)
  }

  const recentNews = relevantSignals.filter(s => s.type === 'news').slice(0, 3)
  if (recentNews.length) {
    watchOuts.push(`Read the ${recentNews.length} recent news items about competitors in your target market before the meeting — client will assume you know current events.`)
  }

  return watchOuts
}

// ── Build questions to ask ────────────────────────────────────────────────────
function buildQuestionsToAsk({ opportunity, meetingContext, incumbents, districtProfile }) {
  const questions = []

  // Universal
  questions.push(`What outcomes matter most to your leadership over the next 3 years?`)
  questions.push(`How will this project be measured internally — what does success look like at Year 1, Year 3, Year 5?`)

  // Incumbency-aware
  if (incumbents.length > 0) {
    questions.push(`What's working well with your current facilities/energy partners, and where do you see room for improvement?`)
  } else {
    questions.push(`Have you worked with an ESCO or performance contractor before? What was that experience like?`)
  }

  // Segment-specific
  if (opportunity.segment === 'Schools') {
    questions.push(`How is your bond program structured, and where does energy/facility work fit in the priority stack?`)
    questions.push(`How do you think about balancing capital projects with operational savings that return to the classroom?`)
  } else if (opportunity.segment === 'Healthcare') {
    questions.push(`How is facility performance affecting patient experience or clinical operations today?`)
    questions.push(`What's your position on sustainability and Joint Commission energy resilience requirements?`)
  } else if (opportunity.segment === 'University') {
    questions.push(`How does this project connect to broader campus decarbonization or capital plans?`)
    questions.push(`Who are the key stakeholders across facilities, sustainability office, and finance?`)
  } else if (opportunity.segment === 'Municipal') {
    questions.push(`How does this fit into your capital improvement plan and council priorities?`)
    questions.push(`Are there federal funding sources you're targeting (IRA, IIJA, DOE) that shape scope?`)
  }

  // Meeting-purpose-specific
  if (meetingContext?.meetingPurpose?.toLowerCase().includes('discovery')) {
    questions.push(`What would need to be true for you to feel like this project was a home run?`)
  }
  if (meetingContext?.meetingPurpose?.toLowerCase().includes('proposal')) {
    questions.push(`When you evaluate proposals, what are the top 3 things you'll look at first?`)
  }

  return questions
}

// ── Utility ───────────────────────────────────────────────────────────────────
function mostFrequent(arr) {
  if (!arr?.length) return null
  const counts = {}
  arr.forEach(x => { counts[x] = (counts[x] || 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
}

/**
 * Format the brief as plain text for copy/paste into email or docs.
 */
export function formatBriefAsText(brief) {
  const lines = []
  lines.push(`PRE-CALL BRIEF — ${brief.opportunity.agency}`)
  lines.push(`Generated: ${new Date(brief.generatedAt).toLocaleString()}`)
  lines.push('')
  lines.push(`OPPORTUNITY`)
  lines.push(`  ${brief.opportunity.title || '(no title)'}`)
  lines.push(`  ${brief.opportunity.state} · ${brief.opportunity.segment}${brief.opportunity.value ? ` · $${(brief.opportunity.value / 1e6).toFixed(1)}M` : ''}`)
  if (brief.meetingContext?.meetingPurpose) {
    lines.push(`  Purpose: ${brief.meetingContext.meetingPurpose}`)
  }
  lines.push('')

  if (brief.talkingPoints.length) {
    lines.push('TALKING POINTS')
    brief.talkingPoints.forEach(p => {
      lines.push(`  [${p.category}]`)
      lines.push(`  ${p.point}`)
      lines.push('')
    })
  }

  if (brief.watchOuts.length) {
    lines.push('WATCH-OUTS')
    brief.watchOuts.forEach(w => lines.push(`  • ${w}`))
    lines.push('')
  }

  if (brief.questions.length) {
    lines.push('QUESTIONS TO ASK')
    brief.questions.forEach(q => lines.push(`  • ${q}`))
    lines.push('')
  }

  if (brief.topCompetitors.length) {
    lines.push('LIKELY COMPETITORS')
    brief.topCompetitors.forEach(c => {
      lines.push(`  ${c.competitor} — ${(c.winLikelihood * 100).toFixed(0)}% win likelihood`)
    })
  }

  return lines.join('\n')
}
