/**
 * /api/capture-agenda.js
 *
 * Vercel serverless function. Three operations:
 *   POST   — create a new capture
 *   DELETE — remove a capture by id
 *   PATCH  — re-run extraction on an existing capture's stored text
 *
 * PATCH is designed so that when the Anthropic API key lands, we swap out
 * `extractAgendaDetails()` for an AI-powered version and the rescore button
 * automatically uses it. No frontend changes needed.
 */

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO || 'Rintamaki/mush-predict-v2'
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured' })
  }

  if (req.method === 'POST')   return handleCreate(req, res, token, repo)
  if (req.method === 'DELETE') return handleDelete(req, res, token, repo)
  if (req.method === 'PATCH')  return handleRescore(req, res, token, repo)

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── POST: create ────────────────────────────────────────────────────────────
async function handleCreate(req, res, token, repo) {
  const { agency, state, url, meetingDate, agendaText, submittedBy } = req.body || {}
  if (!agency || !agendaText) {
    return res.status(400).json({ error: 'agency and agendaText are required' })
  }

  const extracted = await extractAgendaDetails(agendaText)

  const capture = {
    id:            'cap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    capturedAt:    new Date().toISOString(),
    agency:        agency.trim(),
    state:         (state || 'TX').toUpperCase(),
    url:           url || '',
    meetingDate:   meetingDate || null,
    submittedBy:   submittedBy || '',
    agendaText:    agendaText.slice(0, 30000),
    items:         extracted.items,
    actionTypes:   extracted.actionTypes,
    keywordHits:   extracted.keywordHits,
    relevanceScore: extracted.relevanceScore,
    extractionMethod: extracted.method,       // "rules" or "ai" — for auditability
    scoredAt:      new Date().toISOString(),
  }

  try {
    const { existing, sha } = await readCurrentFile(token, repo)
    const updated = [capture, ...existing].slice(0, 2000)
    await writeFile(token, repo, updated, sha, `Agenda capture: ${capture.agency}`)
    return res.status(200).json({ ok: true, capture })
  } catch (err) {
    return res.status(500).json({ error: 'Write failed', detail: err.message })
  }
}

// ── DELETE: remove by id ────────────────────────────────────────────────────
async function handleDelete(req, res, token, repo) {
  const id = req.query?.id || req.body?.id
  if (!id) return res.status(400).json({ error: 'id required' })

  try {
    const { existing, sha } = await readCurrentFile(token, repo)
    const filtered = existing.filter(c => c.id !== id)
    if (filtered.length === existing.length) {
      return res.status(404).json({ error: 'Capture not found' })
    }
    await writeFile(token, repo, filtered, sha, `Delete agenda capture ${id}`)
    return res.status(200).json({ ok: true, deletedId: id, remaining: filtered.length })
  } catch (err) {
    return res.status(500).json({ error: 'Delete failed', detail: err.message })
  }
}

// ── PATCH: rescore an existing capture ──────────────────────────────────────
async function handleRescore(req, res, token, repo) {
  const id = req.query?.id || req.body?.id
  if (!id) return res.status(400).json({ error: 'id required' })

  try {
    const { existing, sha } = await readCurrentFile(token, repo)
    const idx = existing.findIndex(c => c.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Capture not found' })

    const cap = existing[idx]
    if (!cap.agendaText || cap.agendaText.length < 20) {
      return res.status(400).json({ error: 'No stored agenda text to re-score' })
    }

    // Re-run extraction on the stored text
    const extracted = await extractAgendaDetails(cap.agendaText)

    const rescored = {
      ...cap,
      items:            extracted.items,
      actionTypes:      extracted.actionTypes,
      keywordHits:      extracted.keywordHits,
      relevanceScore:   extracted.relevanceScore,
      extractionMethod: extracted.method,
      scoredAt:         new Date().toISOString(),
    }

    const updated = [...existing]
    updated[idx] = rescored

    await writeFile(token, repo, updated, sha, `Rescore agenda capture ${id}`)
    return res.status(200).json({ ok: true, capture: rescored })

  } catch (err) {
    return res.status(500).json({ error: 'Rescore failed', detail: err.message })
  }
}

// ── GitHub file helpers ─────────────────────────────────────────────────────
const FILE_PATH = 'mush-predict-package/public/data/agenda_captures.json'

async function readCurrentFile(token, repo) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${FILE_PATH}`
  const headers = {
    'Authorization': `token ${token}`,
    'Accept':        'application/vnd.github.v3+json',
    'User-Agent':    'mush-predict-agenda-capture',
  }
  const resp = await fetch(apiUrl, { headers })
  if (!resp.ok) return { existing: [], sha: null }
  const data = await resp.json()
  const decoded = Buffer.from(data.content, 'base64').toString('utf-8')
  let existing = []
  try {
    existing = JSON.parse(decoded)
    if (!Array.isArray(existing)) existing = []
  } catch { existing = [] }
  return { existing, sha: data.sha }
}

async function writeFile(token, repo, content, sha, message) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${FILE_PATH}`
  const headers = {
    'Authorization': `token ${token}`,
    'Accept':        'application/vnd.github.v3+json',
    'User-Agent':    'mush-predict-agenda-capture',
    'Content-Type':  'application/json',
  }
  const payload = {
    message,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
  }
  if (sha) payload.sha = sha
  const resp = await fetch(apiUrl, {
    method: 'PUT', headers, body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(err)
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION — this is the swap point for AI upgrade
// ─────────────────────────────────────────────────────────────────────────────
/**
 * When ANTHROPIC_API_KEY is set as an env var, uses Claude to extract structured
 * data from the agenda text. Otherwise falls back to rules-based extraction.
 *
 * Both paths return the same shape:
 *   { items, actionTypes, keywordHits, relevanceScore, method }
 *
 * The `method` field is stamped onto the capture so you can see which captures
 * used AI vs rules extraction. Useful for tracking coverage after the API key
 * lands.
 */
async function extractAgendaDetails(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      return await extractWithAI(text, apiKey)
    } catch (err) {
      console.error('AI extraction failed, falling back to rules:', err.message)
      return extractWithRules(text)
    }
  }
  return extractWithRules(text)
}

// ── Rules-based extraction (works today, no API key needed) ─────────────────
function extractWithRules(text) {
  const lower = text.toLowerCase()
  const actionSignals = {
    'RFP mention':     ['rfp', 'request for proposals', 'request for qualifications', 'rfq'],
    'Bond':            ['bond', 'proposition', 'bond election', 'voters approved'],
    'HVAC / Facility': ['hvac', 'chiller', 'boiler', 'air handler', 'roof replacement', 'facility'],
    'Energy':          ['energy performance', 'espc', 'energy conservation', 'solar', 'lighting retrofit'],
    'Construction':    ['construction', 'renovation', 'new campus', 'new building', 'modernization'],
    'Vote / Action':   ['motion to approve', 'motion carried', 'board action', 'unanimous', 'voted to approve'],
    'Budget':          ['budget amendment', 'capital budget', 'purchasing', 'contract award'],
    'Discussion':      ['discussion regarding', 'update on', 'presentation on', 'workshop'],
  }
  const actionTypes = []
  const keywordHits = []
  for (const [action, kws] of Object.entries(actionSignals)) {
    const hit = kws.find(k => lower.includes(k))
    if (hit) { actionTypes.push(action); keywordHits.push(hit) }
  }
  const itemPattern = /^(?:\d+[\.\)]|\d+\.[A-Z][\.\)]?|[A-Z][\.\)]|item\s+\d+)\s*[:\.\-\s]+(.{15,200})/gim
  const items = []
  let match
  while ((match = itemPattern.exec(text)) !== null && items.length < 50) {
    const itemText = match[1].trim().replace(/\s+/g, ' ')
    if (itemText.length >= 15) items.push(itemText)
  }
  let relevanceScore = 0
  if (actionTypes.includes('RFP mention'))     relevanceScore += 3
  if (actionTypes.includes('Bond'))            relevanceScore += 3
  if (actionTypes.includes('HVAC / Facility')) relevanceScore += 2
  if (actionTypes.includes('Energy'))          relevanceScore += 2
  if (actionTypes.includes('Construction'))    relevanceScore += 2
  if (actionTypes.includes('Vote / Action'))   relevanceScore += 1
  if (actionTypes.includes('Budget'))          relevanceScore += 1
  relevanceScore = Math.min(5, relevanceScore)
  return { items, actionTypes, keywordHits, relevanceScore, method: 'rules' }
}

// ── AI-based extraction (used automatically when ANTHROPIC_API_KEY is set) ──
async function extractWithAI(text, apiKey) {
  const trimmed = text.slice(0, 12000)

  const prompt = `You're analyzing a school district or public sector board meeting agenda for signals relevant to McKinstry — a public-sector energy, HVAC, and facilities modernization contractor.

Read this agenda and return ONLY a JSON object with these fields:

{
  "items": [array of concrete agenda items you found, cleaned up as 1-2 sentence descriptions],
  "actionTypes": [array from this set: "RFP mention", "Bond", "HVAC / Facility", "Energy", "Construction", "Vote / Action", "Budget", "Discussion"],
  "keywordHits": [array of specific phrases that triggered each actionType],
  "relevanceScore": integer 0-5,
  "summary": "one sentence describing what this meeting is about"
}

Score 0-5 based on McKinstry sales relevance:
  5 = active RFP release or bond program directly involving facilities/HVAC/energy
  4 = imminent RFP or bond planning with facility scope
  3 = clear discussion of facility, HVAC, or energy work
  2 = general capital planning or budget movement with likely facility touch
  1 = tangential mention
  0 = no signal

Return ONLY the JSON. No preamble, no explanation.

AGENDA:
${trimmed}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Anthropic API error: ${err}`)
  }

  const data = await resp.json()
  const content = data.content?.[0]?.text || ''

  // Extract JSON from response — Claude sometimes wraps in ```json blocks
  const cleaned = content.replace(/```json\s*|\s*```/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Could not parse AI response as JSON')
  }

  return {
    items:          Array.isArray(parsed.items) ? parsed.items.slice(0, 50) : [],
    actionTypes:    Array.isArray(parsed.actionTypes) ? parsed.actionTypes : [],
    keywordHits:    Array.isArray(parsed.keywordHits) ? parsed.keywordHits : [],
    relevanceScore: Math.max(0, Math.min(5, parseInt(parsed.relevanceScore) || 0)),
    summary:        parsed.summary || '',
    method:         'ai',
  }
}
