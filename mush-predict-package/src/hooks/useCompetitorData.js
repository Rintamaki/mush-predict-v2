import { useState, useEffect } from 'react'

export function useCompetitorData() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch('./data/competitors.json?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then(json => { setData(json); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  return {
    competitors: data?.competitors ?? [],
    sources:     data?.data_sources_active ?? [],
    lastUpdated: data?.last_updated_display ?? '',
    loading,
    error,
  }
}
