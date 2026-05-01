/**
 * useSimulator — Fase 4
 * Gestiona el ciclo de vida de una operación simulada:
 *   IDLE → OPEN → (TP1 | TP2 | TP3 | SL_TOUCHED) → POST_MORTEM → IDLE
 *
 * Integra Snapshot Processing: solo corre lógica pesada en ticks relevantes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Kline } from '../types/market'
import type { AnalysisSignal } from '../types/analysis'
import type { BrainEntry, BrainFile, TradeResult } from '../types/brain'
import {
  loadBrain,
  addBrainEntry,
  runPostMortem,
  logTradeOpen,
  logTradeClose,
  recordTpOutcome,
  recordRrMiss,
} from '../utils/brainStorage'
import { notificarApertura, notificarCierre } from '../utils/telegramSender'
import {
  evaluateSnapshot,
  createSnapshotState,
  type MarketSnapshot,
  type SnapshotState,
} from '../utils/snapshotProcessor'

// ─── Estado del simulador ─────────────────────────────────────────────────────
export type SimPhase = 'idle' | 'open' | 'closed'

interface PendingTpCheck {
  target: number
  level: 'TP1' | 'TP2'
  direction: 'long' | 'short'
  deadline: number
}

interface PendingRrCheck {
  tp1: number
  direction: 'long' | 'short'
  deadline: number
}

export interface SimState {
  phase: SimPhase
  openTrade: BrainEntry | null   // operación en curso
  lastClosed: BrainEntry | null  // última operación cerrada (con PM si aplica)
  brain: BrainFile
  lastSnapshot: MarketSnapshot | null
  snapshotState: SnapshotState
  adjustedScore: number
  pendingTpCheck: PendingTpCheck | null  // monitoreo post-cierre para aprender TPs
  pendingRrCheck: PendingRrCheck | null  // monitoreo de entrada rechazada por R:R
}

const CONFIDENCE_THRESHOLD = 76
const COOLDOWN_MS  = 60_000   // mínimo 60s entre operaciones
const SIGNAL_MAX_AGE_MS = 30_000  // señal válida por máx 30s desde su generación

function shortId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function useSimulator(
  klines: Kline[],
  currentKline: Kline | null,
  currentPrice: number,
  fundingRate: number | null,
  signal: AnalysisSignal | null,
) {
  const [state, setState] = useState<SimState>(() => ({
    phase: 'idle',
    openTrade: null,
    lastClosed: null,
    brain: loadBrain(),
    lastSnapshot: null,
    snapshotState: createSnapshotState(),
    adjustedScore: 0,
    pendingTpCheck: null,
    pendingRrCheck: null,
  }))

  const lastTradeTimeRef = useRef<number>(0)

  // ── Tick principal: evalúa snapshot y gestiona la operación ──────────────
  useEffect(() => {
    if (!signal || currentPrice === 0 || klines.length < 20) return

    setState(prev => {
      // ── 1. Snapshot Processing ────────────────────────────────────────────
      const snapResult = evaluateSnapshot(
        klines, currentKline, currentPrice, fundingRate,
        prev.adjustedScore, prev.snapshotState,
      )

      // ── 2. Monitoreos pre-snapshot: funcionan en cualquier fase/mercado lateral ──

      // 2a. ¿El precio llegó al siguiente TP tras cierre?
      if (prev.phase === 'closed' && prev.pendingTpCheck) {
        const check = prev.pendingTpCheck
        const reached = check.direction === 'long'
          ? currentPrice >= check.target
          : currentPrice <= check.target
        const expired = Date.now() > check.deadline
        if (reached || expired) {
          recordTpOutcome(check.level, reached)
          return { ...prev, pendingTpCheck: null, brain: loadBrain() }
        }
      }

      // 2b. ¿La entrada rechazada por R:R hubiera ganado?
      if (prev.phase !== 'open' && prev.pendingRrCheck) {
        const rr = prev.pendingRrCheck
        const reached = rr.direction === 'long'
          ? currentPrice >= rr.tp1
          : currentPrice <= rr.tp1
        const expired = Date.now() > rr.deadline
        if (reached || expired) {
          recordRrMiss(reached)  // solo ajusta minRR si era ganadora
          return { ...prev, pendingRrCheck: null, brain: loadBrain() }
        }
      }

      if (!snapResult && prev.phase !== 'open') return prev

      const newSnapshotState = snapResult?.newState ?? prev.snapshotState
      const lastSnapshot     = snapResult?.snapshot ?? prev.lastSnapshot
      const adjustedScore    = snapResult ? signal.score : prev.adjustedScore

      // ── 3. Vigilar SL y TPs del trade abierto ────────────────────────────
      if (prev.phase === 'open' && prev.openTrade) {
        const trade  = prev.openTrade
        const isLong = trade.direction === 'long'
        const w      = prev.brain.weights

        // Si históricamente el precio suele continuar al siguiente TP (≥60%),
        // el bot salta el TP inferior y aguanta al siguiente.
        const skipTp1 = trade.tp2 !== null && w.tp1HoldRate >= 0.60
        const skipTp2 = trade.tp3 !== null && w.tp2HoldRate >= 0.60

        let resultado: TradeResult | null = null
        let exitPrice: number | null = null

        if      (isLong  && currentPrice <= trade.sl)  { resultado = 'SL_tocado'; exitPrice = trade.sl }
        else if (!isLong && currentPrice >= trade.sl)  { resultado = 'SL_tocado'; exitPrice = trade.sl }
        else if (trade.tp3 !== null && isLong  && currentPrice >= trade.tp3) { resultado = 'TP3'; exitPrice = trade.tp3 }
        else if (trade.tp3 !== null && !isLong && currentPrice <= trade.tp3) { resultado = 'TP3'; exitPrice = trade.tp3 }
        else if (!skipTp2 && trade.tp2 !== null && isLong  && currentPrice >= trade.tp2) { resultado = 'TP2'; exitPrice = trade.tp2 }
        else if (!skipTp2 && trade.tp2 !== null && !isLong && currentPrice <= trade.tp2) { resultado = 'TP2'; exitPrice = trade.tp2 }
        else if (!skipTp1 && isLong  && currentPrice >= trade.tp1) { resultado = 'TP1'; exitPrice = trade.tp1 }
        else if (!skipTp1 && !isLong && currentPrice <= trade.tp1) { resultado = 'TP1'; exitPrice = trade.tp1 }

        if (resultado && exitPrice !== null) {
          const pnlPct = isLong
            ? ((exitPrice - trade.entry) / trade.entry) * 100
            : ((trade.entry - exitPrice) / trade.entry) * 100

          let closedTrade: BrainEntry = { ...trade, resultado, exitPrice, pnlPct }
          let updatedBrain = prev.brain

          if (resultado === 'SL_tocado') {
            const pm = runPostMortem(trade, exitPrice, fundingRate)
            closedTrade = pm.updatedEntry
            updatedBrain = loadBrain()
          } else {
            addBrainEntry(closedTrade)
            updatedBrain = loadBrain()
          }

          logTradeClose(closedTrade.id, { resultado, exitPrice, pnlPct, postMortem: closedTrade.postMortem ?? null })
          notificarCierre({ ...closedTrade, pnlPct })
          lastTradeTimeRef.current = Date.now()

          // Programar monitoreo del siguiente TP para aprender a aguantar
          const now2 = Date.now()
          const deadline = now2 + 14_400_000  // ventana de 4 horas
          const pendingTpCheck: PendingTpCheck | null =
            resultado === 'TP1' && trade.tp2 !== null
              ? { target: trade.tp2, level: 'TP1', direction: trade.direction, deadline }
              : resultado === 'TP2' && trade.tp3 !== null
              ? { target: trade.tp3, level: 'TP2', direction: trade.direction, deadline }
              : null

          return {
            ...prev, phase: 'closed', openTrade: null,
            lastClosed: closedTrade, brain: updatedBrain,
            lastSnapshot, snapshotState: newSnapshotState, adjustedScore,
            pendingTpCheck,
          }
        }

        return { ...prev, lastSnapshot, snapshotState: newSnapshotState, adjustedScore }
      }

      // ── 3. Evaluar apertura ───────────────────────────────────────────────
      if (!snapResult) return { ...prev, snapshotState: newSnapshotState, adjustedScore }

      const now         = Date.now()
      const cooldownOk  = now - lastTradeTimeRef.current > COOLDOWN_MS
      const signalFresh = (now - (signal.timestamp ?? 0)) < SIGNAL_MAX_AGE_MS
      const entry = signal.suggestedEntry
      const sl    = signal.suggestedSL
      const tp1   = signal.suggestedTP1
      const dir   = signal.direction

      const minRR = prev.brain.weights.minRR ?? 0.7

      // Wyckoff moderate/strong bypasea el filtro R:R — la trampa confirmada compensa
      const wyckoffBypass = signal.wyckoff?.strength === 'moderate' || signal.wyckoff?.strength === 'strong'

      // directionOk: posición del precio y dirección válida (sin R:R)
      const directionOk = entry !== null && sl !== null && tp1 !== null && (
        dir === 'long' ? currentPrice < tp1 && sl < entry : currentPrice > tp1 && sl > entry
      )

      // rrOk: ratio riesgo:beneficio — bypaseado por Wyckoff moderate/strong
      const rrOk = directionOk && (wyckoffBypass || (() => {
        const reward = dir === 'long' ? tp1! - entry! : entry! - tp1!
        const risk   = dir === 'long' ? entry! - sl!  : sl!   - entry!
        return risk > 0 && reward / risk >= minRR
      })())

      const geometryOk = directionOk && rrOk

      const canOpen = adjustedScore >= CONFIDENCE_THRESHOLD
                   && dir !== 'neutral'
                   && entry !== null && sl !== null && tp1 !== null
                   && cooldownOk && signalFresh && geometryOk

      // Si dirección ok pero R:R bloqueó → registrar para auto-aprendizaje
      if (directionOk && !rrOk && adjustedScore >= CONFIDENCE_THRESHOLD
          && signalFresh && cooldownOk && prev.phase !== 'open') {
        return {
          ...prev, lastSnapshot, snapshotState: newSnapshotState, adjustedScore,
          pendingRrCheck: {
            tp1: tp1!,
            direction: dir as 'long' | 'short',
            deadline: Date.now() + 14_400_000,
          },
        }
      }

      if (adjustedScore >= CONFIDENCE_THRESHOLD && dir !== 'neutral' && entry !== null && (!signalFresh || !geometryOk)) {
        const reason = !signalFresh ? 'Señal vencida — precio se movió antes de la apertura.' : 'Precio ya superó el TP1 — entrada tardía descartada.'
        addBrainEntry({
          id: shortId(), timestamp: now,
          escenario: `StaleEntry_${dir === 'long' ? 'Long' : 'Short'}`,
          direction: dir as 'long' | 'short', score: adjustedScore,
          scoreBreakdown: { ...signal.scoreBreakdown },
          entry: entry!, sl: sl ?? entry!, tp1: tp1 ?? entry!,
          tp2: signal.suggestedTP2, tp3: signal.suggestedTP3,
          resultado: 'SL_tocado', exitPrice: currentPrice, pnlPct: 0,
          postMortem: {
            failedIndicators: ['estructura'], lesson: reason,
            ajuste: 'No abrir cuando el precio ya superó TP1 o señal >30s.',
            fundingAtExit: fundingRate, volumeAtEntry: 0, marketCondition: `StaleEntry_${dir}`,
          },
        })
        lastTradeTimeRef.current = now
      }

      if (!canOpen) return { ...prev, lastSnapshot, snapshotState: newSnapshotState, adjustedScore }

      const newTrade: BrainEntry = {
        id: shortId(), timestamp: now,
        escenario: buildEscenario(signal, fundingRate),
        direction: signal.direction as 'long' | 'short',
        score: adjustedScore, scoreBreakdown: { ...signal.scoreBreakdown },
        entry: signal.suggestedEntry!, sl: signal.suggestedSL!,
        tp1: signal.suggestedTP1!, tp2: signal.suggestedTP2, tp3: signal.suggestedTP3,
        resultado: 'abierta', exitPrice: null, pnlPct: null, postMortem: null,
      }

      logTradeOpen(newTrade)
      notificarApertura(newTrade)

      return {
        ...prev, phase: 'open', openTrade: newTrade,
        lastSnapshot, snapshotState: newSnapshotState, adjustedScore,
        pendingTpCheck: null, pendingRrCheck: null,
      }
    })
  }, [currentPrice, klines, currentKline, fundingRate, signal])

  // Acción manual: cerrar operación en curso (usuario cierra manualmente)
  const closeManual = useCallback((exitPrice: number) => {
    setState(prev => {
      if (!prev.openTrade) return prev
      const trade = prev.openTrade
      const pnlPct = trade.direction === 'long'
        ? ((exitPrice - trade.entry) / trade.entry) * 100
        : ((trade.entry - exitPrice) / trade.entry) * 100

      const closed: BrainEntry = { ...trade, resultado: 'TP1', exitPrice, pnlPct }
      addBrainEntry(closed)
      logTradeClose(closed.id, { resultado: 'TP1', exitPrice, pnlPct, postMortem: null })
      notificarCierre({ ...closed, pnlPct })
      lastTradeTimeRef.current = Date.now()

      const deadline = Date.now() + 14_400_000
      const pendingTpCheck: PendingTpCheck | null = trade.tp2 !== null
        ? { target: trade.tp2, level: 'TP1', direction: trade.direction, deadline }
        : null

      return { ...prev, phase: 'closed', openTrade: null, lastClosed: closed, brain: loadBrain(), pendingTpCheck }
    })
  }, [])

  // Forzar reset al estado idle
  const reset = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'idle', openTrade: null, pendingTpCheck: null, pendingRrCheck: null }))
  }, [])

  return { state, closeManual, reset }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildEscenario(signal: AnalysisSignal, fundingRate: number | null): string {
  const parts: string[] = []
  if (fundingRate !== null && Math.abs(fundingRate) > 0.0005) parts.push('HighFunding')
  if (signal.stopHunt?.strength && signal.stopHunt.strength >= 2) parts.push('StrongSH')
  else parts.push('WeakSH')
  if (signal.nearestOB && !signal.nearestOB.tested) parts.push('FreshOB')
  if (signal.nearestFVG) parts.push('FVG')
  parts.push(signal.direction === 'long' ? 'Long' : 'Short')
  return parts.join('_')
}
