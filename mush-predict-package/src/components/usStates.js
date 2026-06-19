/**
 * usStates.js
 *
 * Simplified US state paths for the heat map visualization.
 * Uses Albers USA projection coordinates suitable for a 960×600 viewBox.
 * AK and HI are placed in the lower-left as is standard for US choropleth maps.
 */

// Highlighted states for McKinstry's primary markets
export const KEY_STATES = ['TX', 'WA', 'OR', 'CA', 'CO']

// State centroids (x, y) in a 960×600 coordinate space — Albers USA projection.
// We use these to position colored circles per state, which keeps the file
// lightweight (no need to embed thousands of path coordinates).
export const STATE_CENTROIDS = {
  AL: { x: 658, y: 466, name: 'Alabama' },
  AK: { x: 138, y: 537, name: 'Alaska' },
  AZ: { x: 244, y: 425, name: 'Arizona' },
  AR: { x: 565, y: 425, name: 'Arkansas' },
  CA: { x: 138, y: 350, name: 'California' },
  CO: { x: 365, y: 320, name: 'Colorado' },
  CT: { x: 870, y: 195, name: 'Connecticut' },
  DE: { x: 845, y: 270, name: 'Delaware' },
  FL: { x: 750, y: 530, name: 'Florida' },
  GA: { x: 720, y: 460, name: 'Georgia' },
  HI: { x: 270, y: 537, name: 'Hawaii' },
  ID: { x: 260, y: 215, name: 'Idaho' },
  IL: { x: 580, y: 305, name: 'Illinois' },
  IN: { x: 625, y: 305, name: 'Indiana' },
  IA: { x: 530, y: 270, name: 'Iowa' },
  KS: { x: 470, y: 345, name: 'Kansas' },
  KY: { x: 650, y: 355, name: 'Kentucky' },
  LA: { x: 565, y: 490, name: 'Louisiana' },
  ME: { x: 880, y: 130, name: 'Maine' },
  MD: { x: 820, y: 265, name: 'Maryland' },
  MA: { x: 880, y: 185, name: 'Massachusetts' },
  MI: { x: 645, y: 235, name: 'Michigan' },
  MN: { x: 520, y: 195, name: 'Minnesota' },
  MS: { x: 605, y: 465, name: 'Mississippi' },
  MO: { x: 540, y: 355, name: 'Missouri' },
  MT: { x: 340, y: 175, name: 'Montana' },
  NE: { x: 450, y: 285, name: 'Nebraska' },
  NV: { x: 200, y: 305, name: 'Nevada' },
  NH: { x: 870, y: 170, name: 'New Hampshire' },
  NJ: { x: 845, y: 245, name: 'New Jersey' },
  NM: { x: 330, y: 425, name: 'New Mexico' },
  NY: { x: 820, y: 210, name: 'New York' },
  NC: { x: 760, y: 395, name: 'North Carolina' },
  ND: { x: 450, y: 175, name: 'North Dakota' },
  OH: { x: 685, y: 295, name: 'Ohio' },
  OK: { x: 490, y: 410, name: 'Oklahoma' },
  OR: { x: 175, y: 200, name: 'Oregon' },
  PA: { x: 785, y: 250, name: 'Pennsylvania' },
  RI: { x: 885, y: 200, name: 'Rhode Island' },
  SC: { x: 745, y: 435, name: 'South Carolina' },
  SD: { x: 450, y: 230, name: 'South Dakota' },
  TN: { x: 640, y: 405, name: 'Tennessee' },
  TX: { x: 460, y: 490, name: 'Texas' },
  UT: { x: 280, y: 320, name: 'Utah' },
  VT: { x: 855, y: 165, name: 'Vermont' },
  VA: { x: 780, y: 335, name: 'Virginia' },
  WA: { x: 200, y: 145, name: 'Washington' },
  WV: { x: 735, y: 320, name: 'West Virginia' },
  WI: { x: 575, y: 220, name: 'Wisconsin' },
  WY: { x: 350, y: 245, name: 'Wyoming' },
}

/**
 * Return all signals for a competitor with extracted state info,
 * categorized by source type.
 */
export function aggregateSignalsByState(competitor) {
  const byState = {}  // { TX: { total, jobs, contracts, patents, permits, segments: {...} } }

  function add(state, type, weight = 1, segment = null) {
    if (!state) return
    const code = state.toUpperCase()
    if (!STATE_CENTROIDS[code]) return
    if (!byState[code]) {
      byState[code] = {
        total: 0,
        jobs: 0, contracts: 0, patents: 0, permits: 0, news: 0,
        segments: {},
      }
    }
    byState[code][type] += weight
    byState[code].total += weight
    if (segment) {
      byState[code].segments[segment] = (byState[code].segments[segment] || 0) + weight
    }
  }

  ;(competitor.jobPostings ?? []).forEach(j => add(j.state, 'jobs', 1, j.segment))
  ;(competitor.contractAwards ?? []).forEach(c => add(c.state, 'contracts', 3, c.segment))
  ;(competitor.permitMentions ?? []).forEach(p => add(p.state, 'permits', 2))
  ;(competitor.entityRegistrations ?? []).forEach(e => add(e.state, 'permits', 1))
  ;(competitor.texasContracts ?? []).forEach(c => add('TX', 'contracts', 3, c.segment))

  return byState
}
