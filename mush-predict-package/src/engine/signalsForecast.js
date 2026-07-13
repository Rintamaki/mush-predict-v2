/**
 * signalsForecast.js
 *
 * Signals-first "where will each competitor push next" engine.
 *
 * Design:
 *   - Uses accumulated signals.json as primary input
 *   - Applies recency decay: signals in last 30 days count 1.0,
 *     30-90 days count 0.5, 90-180 days count 0.25, older count 0.1
 *   - Groups signals by (company, state, segment) to identify hot zones
 *   - Falls back to competitor snapshot fields for competitors with
 *     fewer than 5 signals, so predictions still exist for cold companies
 *
 * Returns an array of predicted moves per company:
 *   [{ company, moves: [{ state, segment, probability, signalCount, momentum }] }]
 */

// ── Recency decay ────────────────────────────────────────────────────────────
function ageInDays(timestamp) {
  if (!timestamp) return 9999
  try {
    const then = new Date(timestamp)
    if (isNaN(then)) return 9999
    return (Date.now() - then.getTime()) / 86400000
  } catch { return 9999 }
}

function decayWeight(days) {
  if (days <= 30)  return 1.0
  if (days <= 90)  return 0.5
  if (days <= 180) return 0.25
  return 0.1
}

// ── Signal type weights ──────────────────────────────────────────────────────
// Different signal types indicate different levels of pursuit-intent
const TYPE_WEIGHT = {
  contract: 3.0,   // strongest — they already won something here
  bid:      2.0,   // strong — active pursuit right now
  job:      1.5,   // moderate — investing in local capacity
  patent:   0.8,   // weaker — R&D signal, not deal signal
  news:     0.6,   // context, not pursuit
  earnings: 0.3,   // very weak by itself
  permit:   1.2,
  exec:     0.4,
}

// ── Main forecast function ───────────────────────────────────────────────────
/**
 * @param {Array} competitors  from competitors.json (used for fallback)
 * @param {Array} signals      from signals.json (primary input)
 * @returns {Array} forecasts — one per competitor with predicted moves
 */
export function forecastFromSignals(competitors, signals) {
  return competitors.map(comp => {
    const compSignals = (signals || []).filter(s => s.company === comp.name)

    let moves
    let source
    if (compSignals.length >= 5) {
      moves = predictMovesFromSignals(compSignals)
      source = 'signals'
    } else {
      moves = predictMovesFromSnapshot(comp)
      source = 'snapshot'
    }

    return {
      name:            comp.name,
      moves,
      summary:         buildSummary(comp, compSignals, source),
      signalCount:     compSignals.length,
      predictionSource: source,
      raw:             comp,
    }
  }).filter(f => f.moves.length > 0)
}

// ── Signals-based prediction ─────────────────────────────────────────────────
function predictMovesFromSignals(signals) {
  // Bucket signals by (state, segment) with decay-weighted scoring
  const buckets = new Map()

  signals.forEach(s => {
    // Skip signals without geographic data — can't forecast a move to nowhere
    if (!s.state) return

    const days   = ageInDays(s.timestamp)
    const decay  = decayWeight(days)
    const typeW  = TYPE_WEIGHT[s.type] ?? 1.0

    const state   = s.state.toUpperCase()
    // Segment can be "Schools", "Healthcare", "University", "Municipal", or "Other"
    const segment = normalizeSegment(s.segment)
    const key     = `${state}|${segment}`

    const cur = buckets.get(key) || {
      state, segment,
      score: 0,
      recentScore: 0,   // signals in last 30 days only, for momentum
      count: 0,
      recentCount: 0,
      lastSeen: 0,
    }
    cur.score       += decay * typeW
    cur.count       += 1
    if (days <= 30) {
      cur.recentScore += typeW
      cur.recentCount += 1
    }
    if (days < ageInDays(new Date(cur.lastSeen).toISOString())) {
      cur.lastSeen = new Date(s.timestamp).getTime()
    }
    buckets.set(key, cur)
  })

  const rows = [...buckets.values()]
  if (rows.length === 0) return []

  // Normalize scores → probabilities
  const maxScore = Math.max(...rows.map(r => r.score))
  rows.forEach(r => {
    r.probability = maxScore > 0 ? r.score / maxScore : 0
    // Momentum: is activity accelerating? recent score vs long-run score
    // >0.4 means the last 30 days is producing more than 40% of the total decayed score
    r.momentum = r.score > 0 ? r.recentScore / r.score : 0
  })

  // Sort by probability, take top 8
  return rows
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8)
    .map(r => ({
      state:        r.state,
      segment:      r.segment,
      probability:  r.probability,
      signalCount:  r.count,
      recentCount:  r.recentCount,
      momentum:     r.momentum,  // 0..1 — how much of activity is recent
    }))
}

// ── Fallback: snapshot-based prediction (competitors with < 5 signals) ───────
function predictMovesFromSnapshot(comp) {
  const buckets = new Map()

  const bump = (state, segment, weight) => {
    if (!state) return
    const seg = normalizeSegment(segment)
    const key = `${state.toUpperCase()}|${seg}`
    const cur = buckets.get(key) || { state: state.toUpperCase(), segment: seg, score: 0, count: 0 }
    cur.score += weight
    cur.count += 1
    buckets.set(key, cur)
  }

  ;(comp.contractAwards ?? []).forEach(c => bump(c.state, c.segment, 3.0))
  ;(comp.activeBids     ?? []).forEach(b => bump(b.state, b.segment, 2.0))
  ;(comp.jobPostings    ?? []).forEach(j => bump(j.state, j.segment, 1.5))
  ;(comp.permitMentions ?? []).forEach(p => bump(p.state, p.segment, 1.2))
  ;(comp.offices        ?? []).forEach(o => bump(o.state, 'Other', 0.5))

  const rows = [...buckets.values()]
  if (rows.length === 0) return []
  const max = Math.max(...rows.map(r => r.score))
  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => ({
      state:       r.state,
      segment:     r.segment,
      probability: max > 0 ? r.score / max : 0,
      signalCount: r.count,
      recentCount: 0,
      momentum:    0,
    }))
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function normalizeSegment(seg) {
  if (!seg) return 'Other'
  const s = seg.toString()
  if (s === 'Schools' || s === 'Healthcare' || s === 'University' || s === 'Municipal') return s
  return 'Other'
}

function buildSummary(comp, signals, source) {
  if (source === 'snapshot') {
    return comp.recentSignalSummary || `Snapshot-only prediction — no accumulated signal history yet.`
  }
  // Signals-based summary
  const recent = signals.filter(s => ageInDays(s.timestamp) <= 30)
  const byType = {}
  recent.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1 })
  const parts = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${n} ${t}${n > 1 ? 's' : ''}`)
  if (parts.length === 0) {
    return `${signals.length} accumulated signals — no activity in last 30 days.`
  }
  return `Last 30 days: ${parts.join(', ')}. Total accumulated: ${signals.length} signals.`
}
