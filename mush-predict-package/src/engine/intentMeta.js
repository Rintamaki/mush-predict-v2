/**
 * intentMeta.js
 *
 * Shared metadata + helpers for job "intent" tags across the dashboard.
 * Intent is set on job signals by the pipeline / tag_intent.py, but this
 * also provides a client-side classifier fallback so the UI still works on
 * job signals that predate the tagging (or if intent is missing).
 */

export const INTENT_META = {
  Pursuit: {
    label: 'Pursuit',
    color: 'text-mk-gold',
    bg: 'bg-mk-gold/10',
    border: 'border-mk-gold/30',
    meaning: 'Sales/BD hiring — gearing up to win new work',
  },
  Delivery: {
    label: 'Delivery',
    color: 'text-mk-lblue',
    bg: 'bg-mk-lblue/10',
    border: 'border-mk-lblue/30',
    meaning: 'PM/engineering hiring — staffing to deliver work already won',
  },
  Leadership: {
    label: 'Leadership',
    color: 'text-mk-lgreen',
    bg: 'bg-mk-lgreen/10',
    border: 'border-mk-lgreen/30',
    meaning: 'Director/VP hiring — strategic bet on a region or segment',
  },
}

// Client-side fallback classifier — mirrors scrapers/intent_classifier.py
const INTENT_KEYWORDS = [
  ['Leadership', [
    'vice president', 'vp ', 'vp,', 'senior director', 'sr director',
    'sr. director', 'director of', 'director,', 'director -', 'director –',
    'director ', ' director', 'regional director', 'general manager',
    'managing director', 'head of', 'chief', 'president',
    'regional vice', 'area manager', 'market leader',
  ]],
  ['Pursuit', [
    'sales', 'business development', 'bus dev', 'bd ', 'account executive',
    'account manager', 'capture', 'proposal', 'estimator', 'estimating',
    'pre-construction', 'preconstruction', 'client executive',
    'market development', 'sales engineer', 'solutions engineer',
    'account director', 'client development', 'growth',
  ]],
  ['Delivery', [
    'project manager', 'project engineer', 'field engineer', 'technician',
    'superintendent', 'installer', 'service tech', 'commissioning',
    'controls engineer', 'mechanical engineer', 'electrical engineer',
    'construction manager', 'operations', 'foreman', 'site manager',
    'project coordinator', 'field service', 'maintenance', 'startup',
    'design engineer', 'cad', 'drafter', 'estimating coordinator',
  ]],
]

export function classifyIntent(title) {
  if (!title) return ''
  const low = title.toLowerCase()
  for (const [intent, kws] of INTENT_KEYWORDS) {
    if (kws.some(kw => low.includes(kw))) return intent
  }
  return ''
}

/** Get the intent for a signal: use the stored field, or classify on the fly. */
export function getSignalIntent(signal) {
  if (signal.type !== 'job') return ''
  if (signal.intent) return signal.intent
  return classifyIntent(signal.title || '')
}
