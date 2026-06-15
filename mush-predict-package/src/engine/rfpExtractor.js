/**
 * rfpExtractor.js
 *
 * Extracts structured RFP outcome data from uploaded PDF documents.
 *
 * Two modes:
 *   1. FREE  — extracts raw text in-browser using pdf.js, then runs
 *              keyword heuristics to guess fields. User reviews/corrects.
 *   2. AI    — sends the PDF to the Anthropic API (Claude) which reads it
 *              and returns clean structured fields. Activates automatically
 *              when an API key path is available (in-artifact fetch).
 *
 * Both modes return the SAME shape so the rest of the app doesn't care
 * which one ran:
 *   {
 *     title, agency, state, segment, value, winner,
 *     losingBidders: [], awardDate, sourceFile, extractionMode, raw
 *   }
 */

// ── PDF TEXT EXTRACTION (pdf.js, loaded from CDN) ─────────────────────────────
// We load pdf.js dynamically so it doesn't bloat the main bundle.
let pdfjsLib = null

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  // pdf.js from cdnjs
  const script = document.createElement('script')
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
  await new Promise((resolve, reject) => {
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
  pdfjsLib = window.pdfjsLib
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  return pdfjsLib
}

export async function extractTextFromPDF(file) {
  const lib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map(item => item.str).join(' ') + '\n'
  }
  return fullText
}

// ── SEGMENT / STATE / VALUE HEURISTICS (free mode) ────────────────────────────
const SEGMENT_KEYWORDS = {
  Schools:    ['school district', 'isd', 'k-12', 'k12', 'independent school', 'elementary', 'high school'],
  Healthcare: ['hospital', 'health system', 'medical center', 'healthcare', 'clinic'],
  University: ['university', 'college', 'campus', 'higher education'],
  Municipal:  ['city of', 'county', 'municipal', 'town of', 'public works', 'water district', 'courthouse'],
}

const US_STATES = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
}

// Known MUSH competitors to scan for as winners/losers
const KNOWN_COMPETITORS = [
  'Johnson Controls', 'Trane', 'Trane Technologies', 'Ameresco', 'Schneider Electric',
  'Siemens', 'Honeywell', 'NORESCO', 'Cenergistic', 'McKinstry', 'Bernhard',
  'ABM', 'Veolia', 'Constellation', 'ENGIE', 'Convergent', 'Medxcel', 'Sodexo',
]

function guessSegment(text) {
  const lower = text.toLowerCase()
  for (const [seg, kws] of Object.entries(SEGMENT_KEYWORDS)) {
    if (kws.some(k => lower.includes(k))) return seg
  }
  return ''
}

function guessState(text) {
  const lower = text.toLowerCase()
  // Look for state abbreviations like "TX" or full names
  for (const [name, code] of Object.entries(US_STATES)) {
    if (lower.includes(name)) return code
  }
  // Try abbreviations with word boundaries
  const abbrMatch = text.match(/\b([A-Z]{2})\b/g)
  if (abbrMatch) {
    const codes = Object.values(US_STATES)
    const found = abbrMatch.find(a => codes.includes(a))
    if (found) return found
  }
  return ''
}

function guessValue(text) {
  // Look for dollar amounts — prefer the largest, it's usually the contract value
  const matches = text.match(/\$\s?[\d,]+(?:\.\d{2})?(?:\s?(?:million|M|thousand|K))?/gi) || []
  let maxValue = 0
  for (const m of matches) {
    let num = parseFloat(m.replace(/[$,\s]/g, '').replace(/million|M|thousand|K/gi, ''))
    if (/million|M/i.test(m)) num *= 1_000_000
    else if (/thousand|K/i.test(m)) num *= 1_000
    if (num > maxValue) maxValue = num
  }
  return maxValue
}

function findCompetitors(text) {
  const found = []
  for (const comp of KNOWN_COMPETITORS) {
    if (new RegExp(`\\b${comp}\\b`, 'i').test(text)) {
      // Normalize Trane variants
      const normalized = comp === 'Trane' ? 'Trane Technologies'
                       : comp === 'Siemens' ? 'Siemens Smart Infrastructure'
                       : comp === 'ABM' ? 'ABM Industries'
                       : comp === 'ENGIE' ? 'ENGIE Impact'
                       : comp === 'Convergent' ? 'Convergent Energy'
                       : comp
      if (!found.includes(normalized)) found.push(normalized)
    }
  }
  return found
}

function guessWinner(text, competitors) {
  // Look for award language near a competitor name
  const lower = text.toLowerCase()
  const awardPhrases = ['awarded to', 'contract awarded', 'selected', 'winning bidder',
                        'successful bidder', 'notice of award', 'awarded the contract to']
  for (const comp of competitors) {
    const idx = lower.indexOf(comp.toLowerCase())
    if (idx === -1) continue
    // Check if an award phrase appears within 100 chars before the name
    const before = lower.slice(Math.max(0, idx - 100), idx)
    if (awardPhrases.some(p => before.includes(p))) return comp
  }
  return competitors[0] || ''  // fallback to first mentioned
}

function guessDate(text) {
  // Look for date patterns
  const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2,'0')}-${isoMatch[3].padStart(2,'0')}`
  const monthMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i)
  if (monthMatch) {
    const months = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
                   july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'}
    const m = months[monthMatch[1].toLowerCase()]
    return `${monthMatch[3]}-${m}-${monthMatch[2].padStart(2,'0')}`
  }
  return ''
}

// ── FREE EXTRACTION ───────────────────────────────────────────────────────────
export async function extractRFPFree(file) {
  const text = await extractTextFromPDF(file)
  const competitors = findCompetitors(text)
  return {
    title:         '',  // hard to guess reliably — user fills in
    agency:        '',
    state:         guessState(text),
    segment:       guessSegment(text),
    value:         guessValue(text),
    winner:        guessWinner(text, competitors),
    losingBidders: competitors.filter(c => c !== guessWinner(text, competitors)),
    awardDate:     guessDate(text),
    sourceFile:    file.name,
    extractionMode:'free',
    raw:           text.slice(0, 2000),  // keep a snippet for reference
    confidence:    'low',  // free mode always flags for review
  }
}

// ── AI EXTRACTION (Anthropic API) ─────────────────────────────────────────────
export async function extractRFPWithAI(file) {
  // Convert PDF to base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const prompt = `You are analyzing a government RFP or contract award document for a MUSH-market (Municipal, University, Schools, Healthcare) energy services company.

Extract these fields and respond ONLY with valid JSON, no markdown, no preamble:
{
  "title": "short descriptive title of the opportunity",
  "agency": "the issuing agency/owner",
  "state": "two-letter state code",
  "segment": "one of: Schools, Healthcare, University, Municipal",
  "value": numeric contract value in dollars (no commas or symbols, 0 if unknown),
  "winner": "company that won the contract, empty string if not yet awarded",
  "losingBidders": ["array of other companies that bid"],
  "awardDate": "YYYY-MM-DD or empty string"
}

If a field cannot be determined, use an empty string (or 0 for value, [] for losingBidders).`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  const data = await response.json()
  let raw = data.content.map(i => i.text || '').join('').trim()
  raw = raw.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(raw)

  return {
    ...parsed,
    sourceFile:     file.name,
    extractionMode: 'ai',
    confidence:     'high',
  }
}

// ── UNIFIED ENTRY POINT ───────────────────────────────────────────────────────
/**
 * Try AI extraction first; fall back to free extraction if the API
 * isn't available (e.g. no key configured, fetch fails).
 */
export async function extractRFP(file, { preferAI = true } = {}) {
  if (preferAI) {
    try {
      return await extractRFPWithAI(file)
    } catch (e) {
      console.warn('AI extraction unavailable, falling back to free mode:', e.message)
    }
  }
  return await extractRFPFree(file)
}
