/**
 * Tipos del sistema de memoria Brain (Fase 4)
 * Formato alineado con el protocolo del CLAUDE.md
 */

// Escenario codificado tal como define el CLAUDE.md:
// "HighFunding_LiquidDebt_Short" → combinación de condiciones activas
export type Escenario = string

export type TradeResult = 'SL_tocado' | 'TP1' | 'TP2' | 'TP3' | 'abierta'

export type FailedIndicator = 'stopHunt' | 'orderBlock' | 'funding' | 'estructura' | 'wyckoff'

// ─── Registro individual en brain.json ───────────────────────────────────────
export interface BrainEntry {
  id: string                      // UUID corto
  timestamp: number               // Unix ms de apertura
  escenario: Escenario
  direction: 'long' | 'short'
  score: number
  scoreBreakdown: {
    stopHuntScore: number
    orderBlockScore: number
    fundingScore: number
  }
  entry: number
  sl: number
  tp1: number
  tp2: number | null
  tp3: number | null
  resultado: TradeResult
  exitPrice: number | null        // precio real de salida
  pnlPct: number | null          // % de ganancia/pérdida
  postMortem: PostMortem | null   // solo si resultado === 'SL_tocado'
}

// ─── Post-Mortem (análisis de fallo) ─────────────────────────────────────────
export interface PostMortem {
  failedIndicators: FailedIndicator[]  // qué indicador falló
  lesson: string                       // lección en lenguaje humano
  ajuste: string                       // ajuste recomendado (para IA)
  fundingAtExit: number | null
  volumeAtEntry: number
  marketCondition: string              // descripción compacta de contexto
}

// ─── Pesos ajustables del motor (persisten en brain.json) ────────────────────
export interface BrainWeights {
  stopHuntWeight: number    // 0.5 – 1.5  (multiplica el score parcial)
  orderBlockWeight: number
  fundingWeight: number
  minWickPct: number        // umbral mínimo de mecha para considerar SH válido
  tp1HoldRate: number        // 0.0–1.0 — % histórico de veces que precio llegó a TP2 tras TP1
  tp2HoldRate: number        // 0.0–1.0 — % histórico de veces que precio llegó a TP3 tras TP2
  wyckoffWeight: number      // 0.5–1.5 — peso del filtro Wyckoff (sube cuando confirma, baja cuando falla)
  minRR: number              // 0.3–1.2 — ratio riesgo:beneficio mínimo (auto-ajustable)
  lastUpdated: number
}

export const DEFAULT_WEIGHTS: BrainWeights = {
  stopHuntWeight: 1.0,
  orderBlockWeight: 1.0,
  fundingWeight: 1.0,
  minWickPct: 0.08,
  tp1HoldRate: 0.5,
  tp2HoldRate: 0.5,
  wyckoffWeight: 1.0,
  minRR: 0.7,
  lastUpdated: 0,
}

// ─── Estructura completa de brain.json ───────────────────────────────────────
export interface BrainFile {
  version: 2
  weights: BrainWeights
  entries: BrainEntry[]           // solo fallos y éxitos inesperados (CLAUDE.md §4)
  stats: {
    totalTrades: number
    wins: number
    losses: number
    winRate: number
    avgPnlPct: number
  }
}

export const EMPTY_BRAIN: BrainFile = {
  version: 2,
  weights: { ...DEFAULT_WEIGHTS },
  entries: [],
  stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, avgPnlPct: 0 },
}
