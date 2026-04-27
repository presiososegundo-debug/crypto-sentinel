/**
 * Snapshot Processor — Fase 4 (CLAUDE.md §Optimización de Tokens)
 *
 * El bot NO procesa cada tick. Solo dispara lógica pesada cuando:
 *   1. El volumen de la vela actual supera N veces la media (spike)
 *   2. Han pasado más de MAX_IDLE_MS sin ningún snapshot
 *   3. El precio cambió más de PRICE_SPIKE_PCT desde el último snapshot
 *
 * Devuelve un "Snapshot" compacto: solo los campos que la IA necesita.
 */
import type { Kline } from '../types/market'
import type { BrainWeights } from '../types/brain'

// ─── Umbrales ─────────────────────────────────────────────────────────────────
const VOLUME_SPIKE_MULT = 2.0    // volumen actual > 2× media → trigger
const PRICE_SPIKE_PCT   = 0.15   // movimiento de precio > 0.15% → trigger
const MAX_IDLE_MS       = 15_000 // trigger forzado cada 15s sin actividad

export interface MarketSnapshot {
  triggerReason: 'volume_spike' | 'price_spike' | 'idle' | 'initial'
  timestamp: number
  currentPrice: number
  high20: number      // máximo de las últimas 20 velas
  low20: number       // mínimo de las últimas 20 velas
  avgVolume20: number
  currentVolume: number
  volumeRatio: number // currentVolume / avgVolume20
  fundingRate: number | null
  klineCount: number
  // Compresión: los niveles Fibo activos y el score anterior
  prevScore: number
}

export interface SnapshotState {
  lastSnapshotTime: number
  lastSnapshotPrice: number
  lastTriggerReason: MarketSnapshot['triggerReason']
  snapCount: number
}

export function createSnapshotState(): SnapshotState {
  return { lastSnapshotTime: 0, lastSnapshotPrice: 0, lastTriggerReason: 'initial', snapCount: 0 }
}

/**
 * Evalúa si hay que disparar un snapshot ahora.
 * Llamar en cada tick de precio (onmessage del WS).
 * Retorna el snapshot si se debe procesar, o null si no.
 */
export function evaluateSnapshot(
  klines: Kline[],
  currentKline: Kline | null,
  currentPrice: number,
  fundingRate: number | null,
  prevScore: number,
  state: SnapshotState,
): { snapshot: MarketSnapshot; newState: SnapshotState } | null {
  if (klines.length < 10) return null

  const now      = Date.now()
  const elapsed  = now - state.lastSnapshotTime
  const isFirst  = state.lastSnapshotTime === 0

  // Calcular estadísticas de las últimas 20 velas
  const recent = klines.slice(-20)
  const avgVol = recent.reduce((s, k) => s + k.volume, 0) / recent.length
  const high20 = Math.max(...recent.map(k => k.high))
  const low20  = Math.min(...recent.map(k => k.low))
  const curVol = currentKline?.volume ?? (klines[klines.length - 1]?.volume ?? 0)
  const volRatio = avgVol > 0 ? curVol / avgVol : 0

  // ── Evaluar triggers ──────────────────────────────────────────────────────
  let reason: MarketSnapshot['triggerReason'] | null = null

  if (isFirst) {
    reason = 'initial'
  } else if (elapsed > MAX_IDLE_MS) {
    reason = 'idle'
  } else if (volRatio >= VOLUME_SPIKE_MULT) {
    reason = 'volume_spike'
  } else if (state.lastSnapshotPrice > 0) {
    const priceDelta = Math.abs((currentPrice - state.lastSnapshotPrice) / state.lastSnapshotPrice) * 100
    if (priceDelta >= PRICE_SPIKE_PCT) reason = 'price_spike'
  }

  if (reason === null) return null

  const snapshot: MarketSnapshot = {
    triggerReason: reason,
    timestamp: now,
    currentPrice,
    high20,
    low20,
    avgVolume20: avgVol,
    currentVolume: curVol,
    volumeRatio: volRatio,
    fundingRate,
    klineCount: klines.length,
    prevScore,
  }

  const newState: SnapshotState = {
    lastSnapshotTime: now,
    lastSnapshotPrice: currentPrice,
    lastTriggerReason: reason,
    snapCount: state.snapCount + 1,
  }

  return { snapshot, newState }
}

/**
 * Aplica los pesos del brain al score crudo.
 * Se llama solo cuando hay snapshot — nunca en cada tick.
 */
export function applyBrainWeights(
  rawBreakdown: { stopHuntScore: number; orderBlockScore: number; fundingScore: number },
  weights: BrainWeights,
): number {
  const weighted =
    rawBreakdown.stopHuntScore   * weights.stopHuntWeight +
    rawBreakdown.orderBlockScore * weights.orderBlockWeight +
    rawBreakdown.fundingScore    * weights.fundingWeight

  return Math.max(1, Math.min(100, Math.round(weighted)))
}
