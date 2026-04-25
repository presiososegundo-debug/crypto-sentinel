/**
 * Orquesta el motor de análisis con compresión de datos (CLAUDE.md).
 * Los pesos del brain se cargan en cada cálculo y el sistema detecta
 * sequías de señales para auto-relajar parámetros automáticamente.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { runAnalysis } from '../utils/analysisEngine'
import { loadWeights, recordLowScore, recordHighScore } from '../utils/brainStorage'
import type { BrainWeights } from '../types/brain'
import type { Kline } from '../types/market'
import type { AnalysisSignal } from '../types/analysis'

const PRICE_CHANGE_THRESHOLD = 0.0005   // 0.05%
const MAX_INTERVAL_MS        = 10_000   // forzar recálculo cada 10s
const HIGH_SCORE_THRESHOLD   = 76       // señal activa

interface UseAnalysisProps {
  klines: Kline[]
  currentPrice: number
  fundingRate: number | null
  timeframe?: string
}

export function useAnalysis({ klines, currentPrice, fundingRate, timeframe }: UseAnalysisProps): AnalysisSignal | null {
  const [signal, setSignal]     = useState<AnalysisSignal | null>(null)
  const [weights, setWeights]   = useState<BrainWeights>(loadWeights)
  const lastPriceRef            = useRef<number>(0)
  const lastCalcRef             = useRef<number>(0)
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTimeframeRef        = useRef(timeframe)

  // Reset de señal cuando cambia el timeframe
  useEffect(() => {
    if (prevTimeframeRef.current !== timeframe) {
      prevTimeframeRef.current = timeframe
      setSignal(null)
      lastPriceRef.current = 0
      lastCalcRef.current  = 0
    }
  }, [timeframe])

  const analyse = useCallback(() => {
    const currentWeights = loadWeights()
    const result = runAnalysis({ klines, currentPrice, fundingRate }, currentWeights)
    setSignal(result)
    lastPriceRef.current = currentPrice
    lastCalcRef.current  = Date.now()

    // Auto-ajuste de pesos según sequía / actividad
    if (result.score >= HIGH_SCORE_THRESHOLD && result.direction !== 'neutral') {
      const updated = recordHighScore()
      setWeights(updated)
    } else {
      const updated = recordLowScore(result.score)
      // Solo forzar re-render de pesos si cambiaron (sequía disparó ajuste)
      if (updated.lastUpdated !== currentWeights.lastUpdated) setWeights(updated)
    }
  }, [klines, currentPrice, fundingRate])

  useEffect(() => {
    if (klines.length < 20 || currentPrice === 0) return

    const now        = Date.now()
    const priceDelta = Math.abs((currentPrice - lastPriceRef.current) / (lastPriceRef.current || currentPrice))
    const timeDelta  = now - lastCalcRef.current

    if (priceDelta <= PRICE_CHANGE_THRESHOLD && timeDelta <= MAX_INTERVAL_MS) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(analyse, 0)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [klines, currentPrice, fundingRate, analyse])

  // Exponer pesos activos en la señal para que el BrainPanel los muestre
  void weights

  return signal
}
