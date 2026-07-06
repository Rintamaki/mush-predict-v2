/**
 * /api/capture-agenda.js
 *
 * Vercel serverless function. Receives an agenda capture POST from the
 * dashboard, appends it to `mush-predict-package/public/data/agenda_captures.json`
 * in the repo via the GitHub API, using a server-side token.
 *
 * WHY THIS EXISTS:
 * Writing to the repo from the browser would require exposing a GitHub token
 * in frontend code, where anyone could inspect and steal it. This function
 * runs on Vercel's servers with the token as a private env variable.
 *
 * SETUP REQUIREMENTS:
 * 1. Create a GitHub Personal Access Token with `repo` scope at
 *    https://github.com/settings/tokens
 * 2. Add it to Vercel → Settings → Environment Variables as GITHUB_TOKEN
 * 3. Also add GITHUB_REPO with value "Rintamaki/mush-predict-v2"
 * 4. Redeploy for env vars to take effect
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO || 'Rintamaki/mush-predict-v2'
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured' })
  }

  // Validate the incoming capture
  const { agency, state, url, meetingDate, agendaText, submittedBy } = req.body || {}
  if (!agency || !agendaText) {
    return res.status(400).json({ error: 'agency and agendaText are required' })
  }

  // Extract structured details from the pasted text
  const extracted = extractAgendaDetails(agendaText)

  // Build the capture record
  const capture = {
    id:            'cap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    capturedAt:    new Date().toISOString(),
    agency:        agency.trim(),
    state:         (state || 'TX').toUpperCase(),
    url:           url || '',
    meetingDate:   meetingDate || null,
    submittedBy:   submittedBy || '',
    agendaText:    agendaText.slice(0, 30000),   // cap raw text at 30KB
    items:         extracted.items,
    actionTypes:   extracted.actionTypes,
    keywordHits:   extracted.keywordHits,
    relevanceScore: extracted.relevanceScore,
  }

  const filePath = 'mush-predict-package/public/data/agenda_captures.json'
  const apiUrl   = `https://api.github.com/repos/${repo}/contents/${filePath}`
  const headers  = {
    'Authorization': `token ${token}`,
    'Accept':        'application/vnd.github.v3+json',
    'User-Agent':    'mush-predict-agenda-capture',
  }

  try {
    // Try to fetch the current file to append to it
    let existing = []
    let sha = null
    const getResp = await fetch(apiUrl, { headers })
    if (getResp.ok) {
      const data = await getResp.json()
      sha = data.sha
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8')
      try {
        existing = JSON.parse(decoded)
        if (!Array.isArray(existing)) existing = []
      } catch { existing = [] }
    }

    // Prepend the new capture (newest first)
    const updated = [capture, ...existing].slice(0, 2000)  // cap total at 2000

    // Upload
    const payload = {
      message: `Agenda capture: ${capture.agency}`,
      content: Buffer.from(JSON.stringify(updated, null, 2)).toString('base64'),
    }
    if (sha) payload.sha = sha

    const putResp = await fetch(apiUrl, {
      method:  'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    if (!putResp.ok) {
      const errText = await putResp.text()
      return res.status(500).json({ error: 'GitHub write failed', detail: errText })
    }

    return res.status(200).json({ ok: true, capture })

  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', detail: err.message })
  }
}

// ── Extraction — pulls structured data out of pasted agenda text ─────────────
function extractAgendaDetails(text) {
  const lower = text.toLowerCase()

  // Keyword clusters that indicate action types
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
    if (hit) {
      actionTypes.push(action)
      keywordHits.push(hit)
    }
  }

  // Try to pull individual agenda items — lines starting with number/letter markers
  // e.g. "8.B  Discussion regarding..."  or  "Item 12: Consider approval of..."
  const itemPattern = /^(?:\d+[\.\)]|\d+\.[A-Z][\.\)]?|[A-Z][\.\)]|item\s+\d+)\s*[:\.\-\s]+(.{15,200})/gim
  const items = []
  let match
  while ((match = itemPattern.exec(text)) !== null && items.length < 50) {
    const itemText = match[1].trim().replace(/\s+/g, ' ')
    if (itemText.length >= 15) items.push(itemText)
  }

  // Relevance score for McKinstry — higher = more likely a real pursuit signal
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
