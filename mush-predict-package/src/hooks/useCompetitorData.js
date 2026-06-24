import { useState, useEffect } from 'react'

export function useCompetitorData() {
  const [data, setData]       = useState(null)
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    // Load original competitors (for scoring engine)
    fetch('./data/competitors.json?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then(json => setData(json))
      .catch(e => setError(e.message))

    // ✅ NEW: load signals
    fetch('./data/signals.json?t=' + Date.now())
      .then(r => r.json())
      .then(json => setSignals(json))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false))
  }, [])

  return {
    competitors: data?.competitors ?? [],
    sources: data?.data_sources_active ?? [],
    lastUpdated: data?.last_updated_display ?? '',
    signals, // ✅ NEW
    loading,
    error,
  }
}