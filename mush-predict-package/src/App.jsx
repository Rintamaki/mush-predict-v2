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
    const
