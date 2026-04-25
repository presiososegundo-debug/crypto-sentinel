import type { Kline } from './market'

// ─── Swing Points ─────────────────────────────────────────────────────────────
export interface SwingPoint {
  type: 'high' | 'low'
  price: number
  time: number
  index: number
}

// ─── Stop Hunt ────────────────────────────────────────────────────────────────
export type StopHuntDirection = 'bullish' | 'bearish' // bullish = barrió mínimos y revirtió arriba
export interface StopHunt {
  direction: StopHuntDirection
  sweptPrice: number    // nivel de liquidez barrido
  wickSize: number      // tamaño de la mecha en $
  sweepPercent: number  // % que penetró el nivel
  candleIndex: number
  time: number
  strength: number      // 1-3: cuántos swings fueron barridos
}

// ─── Order Block ──────────────────────────────────────────────────────────────
export type OBType = 'bullish' | 'bearish'
export interface OrderBlock {
  type: OBType
  top: number
  bottom: number
  time: number
  candleIndex: number
  active: boolean       // false si el precio regresó y lo invalidó
  tested: boolean       // true si el precio tocó la zona
  distancePct: number   // % de distancia al precio actual
}

// ─── Fair Value Gap ───────────────────────────────────────────────────────────
export type FVGType = 'bullish' | 'bearish'
export interface FairValueGap {
  type: FVGType
  top: number
  bottom: number
  midpoint: number
  time: number
  candleIndex: number
  filled: boolean
}

// ─── Señal Final ──────────────────────────────────────────────────────────────
export type SignalDirection = 'long' | 'short' | 'neutral'
export interface AnalysisSignal {
  direction: SignalDirection
  score: number             // 1-100
  label: string             // texto del alerta
  tooltip: string           // explicación humana
  stopHunt: StopHunt | null
  nearestOB: OrderBlock | null
  nearestFVG: FairValueGap | null
  scoreBreakdown: {
    stopHuntScore: number   // 0-50
    orderBlockScore: number // 0-30
    fundingScore: number    // 0-20
  }
  suggestedEntry: number | null
  suggestedSL: number | null
  suggestedTP1: number | null  // Fibo 0.618
  suggestedTP2: number | null  // Fibo 1.0
  suggestedTP3: number | null  // Fibo 1.618
  timestamp: number
}

// ─── Contexto completo para el motor ─────────────────────────────────────────
export interface MarketContext {
  klines: Kline[]
  currentPrice: number
  fundingRate: number | null  // null = no disponible aún
}
