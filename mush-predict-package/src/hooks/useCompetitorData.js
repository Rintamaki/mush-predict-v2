import { useState, useEffect } from 'react'

export function useCompetitorData() {
  const [data, setData]       = useState(null)
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    // Load competitors data (feeds the scoring engine)
    fetch('./data/competitors.json?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then(json => setData(json))
      .catch(e => setError(e.message))

    // Load persistent signals (feeds the Signal Stream tab and brief)
    fetch('./data/signals.json?t=' + Date.now())
      .then(r => r.ok ? r.json() : [])
      .then(json => setSignals(Array.isArray(json) ? json : []))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false))
  }, [])

  // Fallback source list if pipeline JSON doesn't include the field
  const DEFAULT_SOURCES = [
    'USASpending.gov', 'SAM.gov', 'SEC EDGAR', 'USPTO PatentsView',
    'Adzuna Jobs', 'Socrata permits', 'Google News RSS',
    'Senate LDA lobbying', 'TX ESBD', 'Bond News',
    'OpenCorporates', 'Construction feeds',
  ]

  // Format the display date from the raw last_updated field
  function formatDate(raw) {
    if (!raw) return ''
    try {
      const d = new Date(raw + 'T00:00:00')
      return d.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    } catch {
      return raw
    }
  }

  return {
    competitors:       data?.competitors ?? [],
    bondOpportunities: data?.bond_opportunities ?? [],
    sources:           data?.data_sources_active?.length ? data.data_sources_active : (data ? DEFAULT_SOURCES : []),
    lastUpdated:       data?.last_updated_display ?? formatDate(data?.last_updated),
    signals,
    loading,
    error,
  }
}
