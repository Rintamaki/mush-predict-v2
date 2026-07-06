import { useState, useEffect } from 'react'
import { Info } from 'lucide-react'
import TopBar               from './components/TopBar'
import TabNav               from './components/TabNav'
import RFPInputForm         from './components/RFPInputForm'
import PredictionCard       from './components/PredictionCard'
import StrategicForecast    from './components/StrategicForecast'
import SignalStream         from './components/SignalStream'
import RFPDatabase          from './components/RFPDatabase'
import DistrictContextPanel from './components/DistrictContextPanel'
import WeightTuner          from './components/WeightTuner'
import PreCallBrief         from './components/PreCallBrief'
import CalibrationDashboard from './components/CalibrationDashboard'
import { useCompetitorData } from './hooks/useCompetitorData'
import {
  rankCompetitorsForOpportunity,
  loadRFPStats,
  loadSavedWeights,
} from './engine/scoringEngine'
import { recordPredictionBatch } from './engine/accuracyTracker'

export default function App() {
  const { competitors, sources, lastUpdated, signals, loading, error } = useCompetitorData()
  const [activeTab, setActiveTab]     = useState('predict')
  const [predictions, setPredictions] = useState(null)
  const [scoredOpp, setScoredOpp]     = useState(null)
  const [rfpRecords, setRfpRecords]   = useState([])
  const [tunerOpen, setTunerOpen]     = useState(false)
  const [recomputeKey, setRecomputeKey] = useState(0)

  useEffect(() => {
    loadSavedWeights()
  }, [])

  useEffect(() => {
    fetch('./data/rfp_history.json?t=' + Date.now())
      .then(r => r.ok ? r.json() : { rfps: [] })
      .then(data => {
        setRfpRecords(data.rfps || [])
        loadRFPStats(data.rfps || [])
      })
      .catch(() => loadRFPStats([]))
  }, [])

  function handleScore(opportunity) {
    const ranked = rankCompetitorsForOpportunity(competitors, opportunity)
    setPredictions(ranked)
    setScoredOpp(opportunity)
    recordPredictionBatch(opportunity, ranked)
  }

  function handleTunerChange() {
    if (scoredOpp) {
      const ranked = rankCompetitorsForOpportunity(competitors, scoredOpp)
      setPredictions(ranked)
    }
    setRecomputeKey(k => k + 1)
  }

  return (
    <div className="dark min-h-screen bg-mk-blue text-white">
      <TopBar
        lastUpdated={lastUpdated}
        sourceCount={sources.length}
        onTuneClick={() => setTunerOpen(true)}
      />

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-white/10 border-t-mk-lblue rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-mk-orange/10 border border-mk-orange/30 rounded-xl p-5 text-center">
            <p className="font-barlow text-sm text-mk-orange">Could not load data: {error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <TabNav active={activeTab} setActive={setActiveTab} />

            {/* ── RFP SCORER ── */}
            {activeTab === 'predict' && (
              <>
                <RFPInputForm onScore={handleScore} />

                {!predictions && (
                  <div className="flex items-start gap-3 bg-mk-lblue/8 border border-mk-lblue/20 rounded-xl px-5 py-4">
                    <Info size={16} className="text-mk-lblue flex-shrink-0 mt-0.5" />
                    <p className="text-white/60 text-sm leading-relaxed">
                      Enter an opportunity above or load a sample to see predictions.
                      The engine scores all {competitors.length} tracked competitors against the opportunity profile and ranks them by win likelihood.
                    </p>
                  </div>
                )}

                {predictions && (
                  <div className="space-y-3 animate-fade-in">

                    <DistrictContextPanel opportunity={scoredOpp} />

                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-barlow font-semibold text-white text-lg">Predictions for: {scoredOpp.title}</h2>
                        <p className="text-white/40 text-xs font-mono mt-1">
                          {scoredOpp.agency} · {scoredOpp.state} · {scoredOpp.segment}
                          {scoredOpp.value ? ` · $${(scoredOpp.value / 1e6).toFixed(1)}M` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => { setPredictions(null); setScoredOpp(null) }}
                        className="text-[11px] font-mono uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
                      >
                        Clear
                      </button>
                    </div>

                    {predictions.map((p, i) => (
                      <PredictionCard
                        key={p.competitor + '-' + recomputeKey}
                        prediction={p}
                        isLeader={i === 0}
                        rank={i + 1}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── STRATEGIC FORECAST ── */}
            {activeTab === 'forecast' && <StrategicForecast competitors={competitors} />}

            {/* ── SIGNAL STREAM ── */}
            {activeTab === 'stream' && <SignalStream signals={signals} />}

            {/* ── RFP DATABASE ── */}
            {activeTab === 'rfpdb' && (
              <RFPDatabase
                existingRecords={rfpRecords}
                onRecordsChange={(updated) => {
                  setRfpRecords(updated)
                  loadRFPStats(updated)
                }}
              />
            )}

            {/* ── ACCURACY / CALIBRATION ── */}
            {activeTab === 'accuracy' && <CalibrationDashboard />}

            {/* ── PRE-CALL BRIEF ── */}
            {activeTab === 'brief' && (
              <PreCallBrief
                competitors={competitors}
                signals={signals}
                rfpRecords={rfpRecords}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-white/5 mt-12 py-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/25">
          McKinstry Predict · Phase 1 · {competitors.length} competitors · {sources.length} data sources · Predictions are probabilistic, not guarantees
        </p>
      </footer>

      <WeightTuner
        open={tunerOpen}
        onClose={() => setTunerOpen(false)}
        onChange={handleTunerChange}
      />
    </div>
  )
}
