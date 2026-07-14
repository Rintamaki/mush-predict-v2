/**
 * districtOpportunity.js
 *
 * Looks up a district's opportunity intelligence (from district_intelligence.json,
 * built by scrapers/district_intelligence.py) and formats it for the pre-call brief.
 */

function normalizeDistrictName(name) {
  if (!name) return ''
  let n = name.toUpperCase().trim()
  n = n.replace('INDEPENDENT SCHOOL DISTRICT', 'ISD')
  n = n.replace(/\s+I\s?S\s?D\b/, ' ISD')
  n = n.split(/\s+/).join(' ')
  return n.toLowerCase()
}

/**
 * @param {Array} districtIntelligence  the `districts` array from district_intelligence.json
 * @param {string} agencyName            the opportunity's agency name (e.g. "Plano ISD")
 * @returns {Object|null} matched district record, or null if not found
 */
export function findDistrictOpportunity(districtIntelligence, agencyName) {
  if (!districtIntelligence?.length || !agencyName) return null

  const key = normalizeDistrictName(agencyName)
  const match = districtIntelligence.find(d =>
    d.district_key === key ||
    normalizeDistrictName(d.district_name) === key
  )
  return match || null
}

/**
 * Build a talking-point-style entry from the district opportunity data,
 * suitable for inserting into the brief's talkingPoints array.
 */
export function buildOpportunityTalkingPoint(districtOpp) {
  if (!districtOpp) return null

  const parts = []
  if (districtOpp.opportunity_score !== null && districtOpp.opportunity_score !== undefined) {
    parts.push(`Overall opportunity score: ${districtOpp.opportunity_score}/100`)
  }
  if (districtOpp.sub_scores?.enrollment_growth_score !== null) {
    const dir = districtOpp.sub_scores.enrollment_growth_score > 50 ? 'growing' : 'declining'
    parts.push(`enrollment is ${dir}`)
  }
  if (districtOpp.sub_scores?.plant_mo_trend_score !== null) {
    const dir = districtOpp.sub_scores.plant_mo_trend_score > 50 ? 'increasing' : 'decreasing'
    parts.push(`Plant M&O spend is ${dir}`)
  }
  if (districtOpp.sub_scores?.debt_capacity_score !== null) {
    const level = districtOpp.sub_scores.debt_capacity_score > 60 ? 'high' : districtOpp.sub_scores.debt_capacity_score > 30 ? 'moderate' : 'low'
    parts.push(`debt capacity is ${level} (${districtOpp.sub_scores.debt_capacity_score}/100)`)
  }

  if (parts.length === 0) return null

  return {
    category: 'District opportunity data',
    point: parts.join(', ') + '.',
  }
}
