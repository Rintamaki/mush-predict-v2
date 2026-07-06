/**
 * briefGenerator.js
 *
 * Assembles a pre-call brief for an AE from all available data:
 *   - Competitor scoring (via rankCompetitorsForOpportunity)
 *   - Incumbency detection (via computeIncumbencies)
 *   - Recent signals for the target state/segment
 *   - District enrichment (if K-12 and available)
 *   - District news (filtered from accumulated news signals)
 *   - Bond activity + bond-cycle inference
 *   - McKinstry's own historical position (from RFP database)
 *
 * Designed for a future AI-powered upgrade: `generateBrief` returns
 * structured data, and the display component templates the narrative.
 * When the Anthropic key lands, we replace `buildTalkingPoints()` and
 * `buildQuestionsToAsk()` with API calls that synthesize richer narrative
 * from the same inputs.
 */

import { rankCompetitorsForOpportunity } from './scoringEngine'
import { computeIncumbencies } from './incumbency'

/**
 * Main entry point.
 */
export function generateBrief({
  opportunity,
  meetingContext,
  competitors,
  signals,
  districtProfile,
  rfpHistory,
  bondOpportunities,     // NEW — from competitors.json top-level bond_opportunities
}) {
  const rankedCompetitors = rankCompetitorsForOpportunity(competitors, opportunity)
  const topCompetitors    = rankedCompetitors.slice(0, 3)
  const incumbents        = findIncumbentsAtAgency(competitors, opportunity.agency)
  const relevantSignals   = filterRelevantSignals(signals, opportunity)
  const mckinstryHistory  = findMcKinstryHistory(rfpHistory, opportunity)

  // NEW — district-specific news from accumulated signals
  const districtNews = findDistrictNews(signals, competitors, opportunity)

  // NEW — bond activity for this district + bond-cycle inference
  const bondActivity = analyzeBondActivity(bondOpportunities, signals, opportunity)

  const talkingPoints = buildTalkingPoints({
    opportunity, meetingContext, topCompetitors, incumbents,
    relevantSignals, mckinstryHistory, districtProfile, bondActivity,
  })

  const watchOuts = buildWatchOuts({
    opportunity, topCompetitors, incumbents, relevantSignals, bondActivity,
  })

  const questions = buildQuestionsToAsk({
    opportunity, meetingContext, incumbents, districtProfile, bondActivity,
  })

  return {
    generatedAt: new Date().toISOString(),
    opportunity, meetingContext,
    topCompetitors, incumbents,
    relevantSignals: relevantSignals.slice(0, 8),
    mckinstryHistory, districtProfile,
    districtNews,          // NEW
    bondActivity,          // NEW
    talkingPoints, watchOuts, questions,
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
        competitor: comp.name,
        awardCount: match.awardCount,
        totalValue: match.totalValue,
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
      if (s.state && s.state.toUpperCase() === oppState) return true
      if (s.segment && opportunity.segment && s.segment === opportunity.segment) return true
      if (s.type === 'news') return true
      return false
    })
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
}

// ── NEW: District-specific news ───────────────────────────────────────────────
/**
 * Look for news articles that mention the specific agency by name.
 * Also cross-check bond news for agency mentions.
 */
function findDistrictNews(signals, competitors, opportunity) {
  const results = []
  const agencyKey = normalizeAgency(opportunity.agency)
  if (!agencyKey || agencyKey.length < 3) return []

  // Split agency name into keywords for looser matching
  // "Plano ISD" → ["plano", "isd"]  → any news title with both matches
  const keywords = agencyKey.split(/\s+/).filter(w => w.length >= 3)

  // Search all accumulated signals for news items mentioning the agency
  ;(signals ?? []).forEach(s => {
    if (s.type !== 'news') return
    const title = (s.title || '').toLowerCase()
    // Require at least one distinctive keyword match
    const matchCount = keywords.filter(k => title.includes(k)).length
    if (matchCount === 0) return
    // For multi-word agencies, require at least 2 matches to reduce false positives
    if (keywords.length >= 2 && matchCount < 2) return
    results.push({
      title: s.title,
      timestamp: s.timestamp,
      url: s.url,
      source: s.source,
      matchStrength: matchCount / keywords.length,
    })
  })

  // Also search competitors' newsArticles arrays directly
  ;(competitors ?? []).forEach(comp => {
    ;(comp.newsArticles ?? []).forEach(article => {
      const title = (article.title || '').toLowerCase()
      const matchCount = keywords.filter(k => title.includes(k)).length
      if (matchCount === 0) return
      if (keywords.length >= 2 && matchCount < 2) return
      // De-dupe against already-collected
      if (results.find(r => r.title === article.title)) return
      results.push({
        title: article.title,
        timestamp: article.published,
        url: article.url,
        source: article.source || 'news',
        mentionsCompetitor: comp.name,
        matchStrength: matchCount / keywords.length,
      })
    })
  })

  // Sort by recency, take top 8
  return results
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, 8)
}

// ── NEW: Bond activity + cycle inference ──────────────────────────────────────
/**
 * Analyze bond activity for this district and infer where they are in the
 * typical Texas school bond cycle:
 *
 *   Bond passes → 6-12mo program planning → 12-24mo RFPs hit → 2-4yr build
 *
 * If we find bond news for this agency, we date-stamp it and generate a
 * "where in the cycle" reading.
 */
function analyzeBondActivity(bondOpportunities, signals, opportunity) {
  const agencyKey = normalizeAgency(opportunity.agency)
  const relevant = []

  // Check the top-level bond_opportunities from the pipeline
  ;(bondOpportunities ?? []).forEach(bond => {
    const bondAgency = normalizeAgency(bond.agency || '')
    const bondTitle = (bond.title || '').toLowerCase()
    if (bondAgency && (bondAgency.includes(agencyKey) || agencyKey.includes(bondAgency))) {
      relevant.push({
        title: bond.title,
        agency: bond.agency,
        value: bond.value,
        date: bond.posted,
        url: bond.url,
        facilitySignal: bond.facility_signal,
      })
    } else if (agencyKey && bondTitle.includes(agencyKey)) {
      relevant.push({
        title: bond.title,
        agency: bond.agency,
        value: bond.value,
        date: bond.posted,
        url: bond.url,
        facilitySignal: bond.facility_signal,
      })
    }
  })

  // Also check accumulated news signals for bond-passage language
  const keywords = agencyKey.split(/\s+/).filter(w => w.length >= 3)
  ;(signals ?? []).forEach(s => {
    if (s.type !== 'news') return
    const title = (s.title || '').toLowerCase()
    const matchCount = keywords.filter(k => title.includes(k)).length
    if (matchCount === 0) return
    if (keywords.length >= 2 && matchCount < 2) return
    // Look for bond-passage language
    if (!/bond|proposition|voters approved|bond election/.test(title)) return
    // De-dupe
    if (relevant.find(r => r.title === s.title)) return
    relevant.push({
      title: s.title,
      agency: opportunity.agency,
      value: 0,
      date: s.timestamp,
      url: s.url,
      facilitySignal: false,
    })
  })

  if (relevant.length === 0) {
    return { found: false, mentions: [], cycleStage: null, timing: null }
  }

  // Sort by date, newest first
  relevant.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  const mostRecent = relevant[0]

  // Infer cycle stage from the age of the most recent bond mention
  const monthsAgo = monthsSince(mostRecent.date)
  let cycleStage = null
  let timing = null

  if (monthsAgo !== null) {
    if (monthsAgo <= 6) {
      cycleStage = 'Just passed'
      timing = 'RFPs unlikely for another 6-18 months. Now is the time to build the relationship and shape the eventual scope.'
    } else if (monthsAgo <= 12) {
      cycleStage = 'Early program planning'
      timing = 'Program manager selection is imminent. First facility RFPs may hit within 6-12 months. Position early.'
    } else if (monthsAgo <= 24) {
      cycleStage = 'Active RFP window'
      timing = 'Prime pursuit territory — bond-funded RFPs are likely hitting the market right now. Ensure you\'re on their bid list.'
    } else if (monthsAgo <= 48) {
      cycleStage = 'Mid-cycle execution'
      timing = 'Bond spend is in flight. Watch for change-order opportunities, additional scope, or new bond cycles being planned.'
    } else {
      cycleStage = 'Cycle likely complete'
      timing = 'This bond is likely fully committed. Ask about the next bond cycle — Texas districts often plan the next one 5-7 years after the last.'
    }
  }

  return {
    found: true,
    mentions: relevant.slice(0, 5),
    mostRecent,
    monthsSinceLast: monthsAgo,
    cycleStage,
    timing,
  }
}

function monthsSince(dateStr) {
  if (!dateStr) return null
  try {
    const then = new Date(dateStr)
    if (isNaN(then)) return null
    const now = new Date()
    return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
  } catch {
    return null
  }
}

// ── McKinstry history at this agency ──────────────────────────────────────────
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
function buildTalkingPoints({
  opportunity, meetingContext, topCompetitors, incumbents,
  relevantSignals, mckinstryHistory, districtProfile, bondActivity,
}) {
  const points = []

  // District scale
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

  // NEW: Bond cycle context — high-value talking point
  if (bondActivity.found && bondActivity.cycleStage) {
    points.push({
      category: 'Bond cycle position',
      point: `${bondActivity.cycleStage.toUpperCase()}: ${bondActivity.timing} Their most recent bond signal was ${bondActivity.monthsSinceLast} months ago${bondActivity.mostRecent?.value ? ` (~$${(bondActivity.mostRecent.value / 1e6).toFixed(0)}M)` : ''}.`,
    })
  }

  // McKinstry's history
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

  // Primary competitor context
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

  // Hiring signals
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

  // Meeting focus
  if (meetingContext?.meetingPurpose) {
    points.push({
      category: 'Meeting focus',
      point: `Purpose: ${meetingContext.meetingPurpose}. Frame McKinstry's approach around outcomes, not features. Have 2-3 comparable public sector case studies ready.`,
    })
  }

  return points
}

// ── Build watch-outs ──────────────────────────────────────────────────────────
function buildWatchOuts({ opportunity, topCompetitors, incumbents, relevantSignals, bondActivity }) {
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

  // Bond-cycle awareness in watch-outs
  if (bondActivity?.found && bondActivity.monthsSinceLast > 48) {
    watchOuts.push(`This district's bond is likely fully committed (${bondActivity.monthsSinceLast} months old). Don't assume there's spending authority — ask about their next bond cycle timeline.`)
  }

  const recentNews = relevantSignals.filter(s => s.type === 'news').slice(0, 3)
  if (recentNews.length) {
    watchOuts.push(`Read the ${recentNews.length} recent news items about competitors in your target market before the meeting — client will assume you know current events.`)
  }

  return watchOuts
}

// ── Build questions to ask ────────────────────────────────────────────────────
function buildQuestionsToAsk({ opportunity, meetingContext, incumbents, districtProfile, bondActivity }) {
  const questions = []

  // Universal opener — always useful
  questions.push(`What outcomes matter most to your leadership over the next 3 years?`)
  questions.push(`How will this project be measured internally — what does success look like at Year 1, Year 3, Year 5?`)

  // NEW — Bond-cycle-aware questions
  if (bondActivity?.found) {
    if (bondActivity.cycleStage === 'Just passed') {
      questions.push(`Congratulations on the recent bond — where does facility work fall in your rollout sequence, and who's leading the program management decision?`)
      questions.push(`What kept the bond from being bigger — is there scope that got cut you'd want back in?`)
    } else if (bondActivity.cycleStage === 'Early program planning') {
      questions.push(`As you're planning the bond rollout, which building systems concern you most — HVAC, roofing, technology, or something else?`)
      questions.push(`How are you thinking about phasing — will you do all campuses in parallel or sequence them?`)
    } else if (bondActivity.cycleStage === 'Active RFP window') {
      questions.push(`Where are you in the RFP release schedule for the bond program?`)
      questions.push(`How are you evaluating vendors on this bond work — lowest price, best value, past performance, or a combination?`)
    } else if (bondActivity.cycleStage === 'Mid-cycle execution') {
      questions.push(`How is the current bond program tracking — any scope that got cut or added?`)
      questions.push(`When do you anticipate the next bond cycle, and what would you want to include this time?`)
    } else if (bondActivity.cycleStage === 'Cycle likely complete') {
      questions.push(`Have discussions started around the next bond cycle? What would be on your wish list?`)
      questions.push(`Any lessons from the last bond you'd want the next program partner to know?`)
    }
  } else if (opportunity.segment === 'Schools') {
    // No bond history detected — ask about it
    questions.push(`When was your last bond and what did it cover? Any plans for the next one?`)
  }

  // Incumbency-aware
  if (incumbents.length > 0) {
    questions.push(`What's working well with your current facilities/energy partners, and where do you see room for improvement?`)
  } else {
    questions.push(`Have you worked with an ESCO or performance contractor before? What was that experience like?`)
  }

  // District-scale-aware
  if (districtProfile?.enrollment?.total >= 20000) {
    questions.push(`With ${districtProfile.enrollment.total.toLocaleString()} students across ${districtProfile.schoolsCount || 'multiple'} buildings, how do you think about maintaining consistency across campuses vs. site-specific solutions?`)
  }

  // Segment-specific
  if (opportunity.segment === 'Schools') {
    questions.push(`How do you think about balancing capital projects with operational savings that return to the classroom?`)
    questions.push(`Who influences facilities decisions beyond you — superintendent, CFO, board members, community?`)
  } else if (opportunity.segment === 'Healthcare') {
    questions.push(`How is facility performance affecting patient experience or clinical operations today?`)
    questions.push(`What's your position on sustainability and Joint Commission energy resilience requirements?`)
    questions.push(`How does the capital planning process work — who else is at the table beyond facilities?`)
  } else if (opportunity.segment === 'University') {
    questions.push(`How does this project connect to broader campus decarbonization or capital plans?`)
    questions.push(`Who are the key stakeholders across facilities, sustainability office, and finance?`)
    questions.push(`What's your governance model for large capital decisions — board approval, president, provost?`)
  } else if (opportunity.segment === 'Municipal') {
    questions.push(`How does this fit into your capital improvement plan and council priorities?`)
    questions.push(`Are there federal funding sources you're targeting (IRA, IIJA, DOE) that shape scope?`)
    questions.push(`Who beyond you influences the vendor selection — council, mayor's office, finance, procurement?`)
  }

  // Meeting-purpose-specific
  const purpose = (meetingContext?.meetingPurpose || '').toLowerCase()
  if (purpose.includes('discovery')) {
    questions.push(`What would need to be true for you to feel like this project was a home run?`)
    questions.push(`What's the one thing you wish vendors would ask you but never do?`)
  }
  if (purpose.includes('proposal')) {
    questions.push(`When you evaluate proposals, what are the top 3 things you'll look at first?`)
    questions.push(`Who else will be reading the proposal, and what are they looking for that you might not be?`)
  }
  if (purpose.includes('relationship') || purpose.includes('introduction')) {
    questions.push(`Who else on your team should I be getting to know before an active pursuit starts?`)
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

  if (brief.bondActivity?.found) {
    lines.push('BOND CYCLE')
    lines.push(`  Stage: ${brief.bondActivity.cycleStage}`)
    lines.push(`  ${brief.bondActivity.timing}`)
    lines.push('')
  }

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

  if (brief.districtNews?.length) {
    lines.push('DISTRICT NEWS')
    brief.districtNews.forEach(n => {
      lines.push(`  ${n.timestamp?.slice(0, 10) || '?'} — ${n.title}`)
    })
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
