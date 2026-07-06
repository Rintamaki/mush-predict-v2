/**
 * /api/capture-agenda.js
 *
 * Vercel serverless function. Two operations:
 *   POST — receive a new capture and append to agenda_captures.json
 *   DELETE — remove a capture by id
 *
 * Writes to `mush-predict-package/public/data/agenda_captures.json`
 * via the GitHub API using a server-side token.
 */

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO || 'Rintamaki/mush-predict-v2'
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured' })
  }

  if (req.method === 'POST')   return handleCreate(req, res, token, repo)
  if (req.method === 'DELETE') return handleDelete(req, res, token, repo)

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── POST: create a new capture ──────────────────────────────────────────────
async function handleCreate(req, res, token, repo) {
  const { agency, state, url, meetingDate, agendaText, submittedBy } = req.body || {}
  if (!agency || !agendaText) {
    return res.status(400).json({ error: 'agency and agendaText are required' })
  }

  const extracted = extractAgendaDetails(agendaText)

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

// ── DELETE: remove a capture by id ──────────────────────────────────────────
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

// ── Extraction ──────────────────────────────────────────────────────────────
function extractAgendaDetails(text) {
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
  return { items, actionTypes, keywordHits, relevanceScore }
}
