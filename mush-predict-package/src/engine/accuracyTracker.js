/**
 * accuracyTracker.js
 *
 * Stores prediction snapshots and the actual outcomes, then computes
 * calibration statistics so the team can prove (or disprove) that the
 * engine's percentages map to reality.
 *
 * Data is persisted to localStorage today; if/when you wire in a backend,
 * swap the storage layer at the top.
 *
 * The KEY measurement is CALIBRATION: when the engine says "70% win
 * likelihood," do competitors actually win ~70% of those opportunities?
 * We bucket predictions into deciles (0-10%, 10-20%, etc.) and compare
 * predicted-mean to observed-actual within each bucket.
 */

const STORE_KEY = 'mush-predict-accuracy-v1'

// ── Storage ──────────────────────────────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : { predictions: [] }
  } catch {
    return { predictions: [] }
  }
}

function save(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch {}
}

// ── Record a new prediction ──────────────────────────────────────────────────
/**
 * Snapshot a prediction at the moment it was made. Call this from
 * App.jsx after rankCompetitorsForOpportunity.
 */
export function recordPredictionBatch(opportunity, predictions) {
  const store = load()
  const batchId = 'pred_' + Date.now().toString(36)
  for (const p of predictions) {
    store.predictions.push({
      id:             batchId + '_' + p.competitor.replace(/\s+/g, '_'),
      batchId,
      recordedAt:     new Date().toISOString(),
      opportunity:    {
        title:   opportunity.title,
        agency:  opportunity.agency,
        state:   opportunity.state,
        segment: opportunity.segment,
        value:   opportunity.value,
      },
      competitor:     p.competitor,
      predictedPursue: p.pursuitLikelihood,
      predictedWin:    p.winLikelihood,
      confidence:      p.confidence,
      // Outcome fields — filled in later when the AE knows what happened
      outcome:         null,         // 'won' | 'lost' | 'no-pursue' | null
      outcomeNotes:    '',
      outcomeRecordedAt: null,
    })
  }
  save(store)
  return batchId
}

// ── Mark an outcome ──────────────────────────────────────────────────────────
/**
 * Update a logged prediction with what actually happened.
 * outcome: 'won' (competitor won the deal), 'lost' (competitor lost),
 *          'no-pursue' (competitor didn't even bid)
 */
export function recordOutcome(predictionId, outcome, notes = '') {
  const store = load()
  const pred  = store.predictions.find(p => p.id === predictionId)
  if (!pred) return false
  pred.outcome           = outcome
  pred.outcomeNotes      = notes
  pred.outcomeRecordedAt = new Date().toISOString()
  save(store)
  return true
}

// ── Reset / delete ───────────────────────────────────────────────────────────
export function clearAllPredictions() {
  save({ predictions: [] })
}

export function deletePrediction(id) {
  const store = load()
  store.predictions = store.predictions.filter(p => p.id !== id)
  save(store)
}

// ── Read all stored predictions ──────────────────────────────────────────────
export function getAllPredictions() {
  return load().predictions
}

// ── Calibration math ─────────────────────────────────────────────────────────
/**
 * Compute calibration buckets for the win-likelihood predictions.
 * Returns an array of buckets like:
 *   [
 *     { rangeLabel: "0-10%",  predicted: 0.05, actual: 0.04, count: 12 },
 *     { rangeLabel: "10-20%", predicted: 0.14, actual: 0.18, count:  8 },
 *     ...
 *   ]
 *
 * A perfectly calibrated model has predicted ≈ actual in every bucket.
 */
export function computeCalibration(field = 'predictedWin') {
  const all = getAllPredictions().filter(p => p.outcome !== null && p.outcome !== 'no-pursue')
  if (all.length === 0) return { buckets: [], totalWithOutcomes: 0, overallBrier: null }

  // Bucket into deciles
  const buckets = []
  for (let i = 0; i < 10; i++) {
    const low  = i / 10
    const high = (i + 1) / 10
    const inBucket = all.filter(p => p[field] >= low && p[field] < high + (i === 9 ? 0.01 : 0))
    if (inBucket.length === 0) {
      buckets.push({
        rangeLabel: `${i * 10}-${(i + 1) * 10}%`,
        predicted:  null,
        actual:     null,
        count:      0,
      })
      continue
    }
    const meanPredicted = inBucket.reduce((s, p) => s + p[field], 0) / inBucket.length
    const wins          = inBucket.filter(p => p.outcome === 'won').length
    const actualRate    = wins / inBucket.length
    buckets.push({
      rangeLabel: `${i * 10}-${(i + 1) * 10}%`,
      predicted:  +meanPredicted.toFixed(3),
      actual:     +actualRate.toFixed(3),
      count:      inBucket.length,
    })
  }

  // Overall Brier score (lower = better, 0 = perfect, 0.25 = chance)
  const brierSum = all.reduce((s, p) => {
    const actual = p.outcome === 'won' ? 1 : 0
    return s + Math.pow(p[field] - actual, 2)
  }, 0)
  const brier = brierSum / all.length

  return {
    buckets,
    totalWithOutcomes: all.length,
    overallBrier:      +brier.toFixed(4),
    // Helpful summary stats
    totalPredictions:  getAllPredictions().length,
    awaitingOutcome:   getAllPredictions().filter(p => p.outcome === null).length,
  }
}

/**
 * Quick win/loss summary by competitor.
 */
export function competitorScorecard() {
  const all = getAllPredictions().filter(p => p.outcome !== null && p.outcome !== 'no-pursue')
  const byName = {}
  for (const p of all) {
    if (!byName[p.competitor]) byName[p.competitor] = { predicted: [], wins: 0, total: 0 }
    byName[p.competitor].predicted.push(p.predictedWin)
    byName[p.competitor].total++
    if (p.outcome === 'won') byName[p.competitor].wins++
  }
  return Object.entries(byName).map(([name, s]) => ({
    competitor:    name,
    n:             s.total,
    actualWinRate: +(s.wins / s.total).toFixed(3),
    avgPredicted:  +(s.predicted.reduce((a, b) => a + b, 0) / s.predicted.length).toFixed(3),
    diff:          +(s.wins / s.total - s.predicted.reduce((a, b) => a + b, 0) / s.predicted.length).toFixed(3),
  })).sort((a, b) => b.n - a.n)
}
