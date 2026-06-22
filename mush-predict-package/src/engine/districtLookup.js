/**
 * districtLookup.js
 *
 * Fetches district context data from districtapi.dev — enrollment,
 * per-pupil expenditure, school count, demographics, locale.
 *
 * Free tier: 500 requests/month. We cache results in localStorage so
 * the same district isn't re-fetched on every page load.
 *
 * API key is configurable — set window.DISTRICT_API_KEY at runtime,
 * or include it in a Vercel environment variable surfaced through Vite.
 * If no key is set, the lookup gracefully no-ops (returns null) so the
 * rest of the dashboard keeps working.
 */

const BASE_URL    = 'https://api.districtapi.dev/v1'
const CACHE_KEY   = 'mush-predict-district-cache-v1'
const CACHE_TTL   = 1000 * 60 * 60 * 24 * 30   // 30 days

// ── Cache helpers ─────────────────────────────────────────────────────────────
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Quota error — clear and skip
  }
}

function cacheGet(key) {
  const cache = loadCache()
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.fetched > CACHE_TTL) return null
  return entry.data
}

function cacheSet(key, data) {
  const cache = loadCache()
  cache[key] = { data, fetched: Date.now() }
  saveCache(cache)
}

// ── API key resolution ────────────────────────────────────────────────────────
function getApiKey() {
  // Three places the key might live, in order of preference
  if (typeof window !== 'undefined' && window.DISTRICT_API_KEY) {
    return window.DISTRICT_API_KEY
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DISTRICT_API_KEY) {
    return import.meta.env.VITE_DISTRICT_API_KEY
  }
  return null
}

// ── Search by name (most common path for our use case) ────────────────────────
/**
 * Look up a district by name. Returns the first matching district profile.
 * Returns null if no key is configured or no match is found.
 */
export async function lookupDistrictByName(name, stateCode = null) {
  if (!name) return null

  const cacheKey = `name:${name.toLowerCase()}|state:${stateCode || ''}`
  const cached   = cacheGet(cacheKey)
  if (cached !== null) return cached

  const apiKey = getApiKey()
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({ name })
    if (stateCode) params.set('state', stateCode)
    const resp = await fetch(`${BASE_URL}/districts/search?${params.toString()}`, {
      headers: { 'X-API-Key': apiKey },
    })
    if (!resp.ok) {
      cacheSet(cacheKey, null)
      return null
    }
    const json = await resp.json()
    const first = (json.data || [])[0] || null
    cacheSet(cacheKey, first)
    return first
  } catch (e) {
    console.warn('District lookup failed:', e.message)
    return null
  }
}

// ── Helper: normalize an agency name into a likely district name ──────────────
/**
 * Take a raw agency name from an RFP (e.g. "Plano Independent School District")
 * and return a clean candidate string for the district API search.
 */
export function normalizeAgencyToDistrict(agency) {
  if (!agency) return null
  return agency
    .replace(/\bIndependent School District\b/i, 'ISD')
    .replace(/\bSchool District\b/i, '')
    .replace(/\bISD\b/i, 'ISD')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Detect whether enrichment is even applicable ──────────────────────────────
/**
 * Returns true if the opportunity looks like a K-12 district that might
 * be findable in NCES data. Universities, hospitals, municipalities, etc.
 * are not in the K-12 dataset and will return nothing.
 */
export function isLikelySchoolDistrict(opportunity) {
  if (opportunity?.segment !== 'Schools') return false
  const agency = (opportunity.agency || '').toLowerCase()
  return /isd|school district|independent school|public schools/.test(agency)
}

// ── Public wrapper: enrich an opportunity object ──────────────────────────────
/**
 * Given an opportunity {agency, state, segment, ...}, return a district
 * profile if applicable. Returns null for non-school opportunities or
 * when no match is found.
 */
export async function enrichOpportunity(opportunity) {
  if (!isLikelySchoolDistrict(opportunity)) return null
  const candidateName = normalizeAgencyToDistrict(opportunity.agency)
  if (!candidateName) return null
  return await lookupDistrictByName(candidateName, opportunity.state)
}
