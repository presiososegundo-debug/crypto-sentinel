/**
 * brainStorage — Persistencia de brain.json en LocalStorage
 * (El navegador no tiene acceso al filesystem; LocalStorage es el equivalente
 *  para una app web local, tal como indica el CLAUDE.md §arquitectura)
 */
import type { BrainFile, BrainEntry, BrainWeights, PostMortem, FailedIndicator } from '../types/brain'
import { EMPTY_BRAIN } from '../types/brain'

const STORAGE_KEY = 'crypto_sentinel_brain_v2'

// ─── CRUD básico ─────────────────────────────────────────────────────────────
export function loadBrain(): BrainFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(EMPTY_BRAIN)
    const parsed = JSON.parse(raw) as BrainFile
    // Migración de versiones antiguas
    if (!parsed.version || parsed.version < 2) return structuredClone(EMPTY_BRAIN)
    return parsed
  } catch {
    return structuredClone(EMPTY_BRAIN)
  }
}

export function saveBrain(brain: BrainFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(brain))
  window.dispatchEvent(new CustomEvent('brain-updated'))
}

export function resetBrain(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Trade Log completo (todos los trades, sin filtros) ───────────────────────
const TRADES_LOG_KEY = 'crypto_sentinel_trades_log'
const MAX_TRADES_LOG = 500

export function loadTradesLog(): BrainEntry[] {
  try {
    const raw = localStorage.getItem(TRADES_LOG_KEY)
    if (!raw) return []
    return JSON.parse(raw) as BrainEntry[]
  } catch { return [] }
}

function saveTradesLog(entries: BrainEntry[]): void {
  localStorage.setItem(TRADES_LOG_KEY, JSON.stringify(entries.slice(0, MAX_TRADES_LOG)))
  window.dispatchEvent(new CustomEvent('trades-log-updated'))
}

export function logTradeOpen(entry: BrainEntry): void {
  const log = loadTradesLog().filter(e => e.id !== entry.id)
  saveTradesLog([entry, ...log])
}

export function logTradeClose(id: string, updates: Partial<BrainEntry>): void {
  const log = loadTradesLog().map(e => e.id === id ? { ...e, ...updates } : e)
  saveTradesLog(log)
}

export function resetTradesLog(): void {
  localStorage.removeItem(TRADES_LOG_KEY)
  window.dispatchEvent(new CustomEvent('trades-log-updated'))
}

// ─── Auto-relajación por sequía de señales ───────────────────────────────────
// Si el motor no dispara señales >= umbral durante N análisis consecutivos,
// los pesos se relajan gradualmente hasta que vuelva a haber actividad.
// Cuando hay una señal exitosa, se restauran hacia 1.0 lentamente.

const DROUGHT_KEY = 'crypto_sentinel_drought'
const DROUGHT_THRESHOLD = 60   // análisis sin señal antes de relajar
const RELAX_STEP = 1.08        // +8% por ciclo de sequía
const RESTORE_STEP = 0.97      // -3% por ciclo de éxito (vuelve a 1.0)
const MAX_WEIGHT = 1.8         // techo para no volverse ruidoso
const MIN_WICK_FLOOR = 0.03    // mecha mínima absoluta (no bajar de aquí)

function loadDrought(): number {
  return parseInt(localStorage.getItem(DROUGHT_KEY) ?? '0', 10)
}
function saveDrought(n: number) {
  localStorage.setItem(DROUGHT_KEY, String(n))
}

// Solo cuenta como sequía si el score es realmente bajo (< 41 = zona roja)
export function recordLowScore(score = 0): BrainWeights {
  if (score >= 41) return loadBrain().weights  // score medio → no penalizar contador
  const streak = loadDrought() + 1
  saveDrought(streak)

  if (streak < DROUGHT_THRESHOLD) return loadBrain().weights

  // Sequía confirmada → relajar pesos
  const brain = loadBrain()
  const w = { ...brain.weights }
  w.stopHuntWeight   = Math.min(w.stopHuntWeight   * RELAX_STEP, MAX_WEIGHT)
  w.orderBlockWeight = Math.min(w.orderBlockWeight * RELAX_STEP, MAX_WEIGHT)
  w.fundingWeight    = Math.min(w.fundingWeight    * RELAX_STEP, MAX_WEIGHT)
  w.minWickPct       = Math.max(w.minWickPct       / RELAX_STEP, MIN_WICK_FLOOR)
  w.lastUpdated      = Date.now()
  brain.weights      = w
  saveBrain(brain)
  saveDrought(0) // reset contador tras ajuste
  return w
}

export function recordHighScore(): BrainWeights {
  saveDrought(0) // hay señal activa — resetear contador de sequía

  // Restaurar pesos gradualmente hacia 1.0
  const brain = loadBrain()
  const w = { ...brain.weights }
  const lerp = (v: number, target: number, step: number) =>
    v > target ? Math.max(target, v * step) : Math.min(target, v / step)

  w.stopHuntWeight   = lerp(w.stopHuntWeight,   1.0, RESTORE_STEP)
  w.orderBlockWeight = lerp(w.orderBlockWeight, 1.0, RESTORE_STEP)
  w.fundingWeight    = lerp(w.fundingWeight,    1.0, RESTORE_STEP)
  w.minWickPct       = lerp(w.minWickPct,       0.08, RESTORE_STEP)
  w.lastUpdated      = Date.now()
  brain.weights      = w
  saveBrain(brain)
  return w
}

export function loadWeights(): BrainWeights {
  return loadBrain().weights
}

// ─── Añadir entrada ───────────────────────────────────────────────────────────
export function addBrainEntry(entry: BrainEntry): BrainFile {
  const brain = loadBrain()
  // Solo guardar fallos y éxitos inesperados (score < 60 pero ganó) — CLAUDE.md §4
  const isLoss    = entry.resultado === 'SL_tocado'
  const unexpWin  = entry.resultado !== 'SL_tocado' && entry.resultado !== 'abierta' && entry.score < 60
  if (!isLoss && !unexpWin) return brain   // éxito esperado → no almacenar

  brain.entries = [entry, ...brain.entries].slice(0, 200) // máx 200 registros
  brain.stats   = recalcStats(brain.entries)
  saveBrain(brain)
  return brain
}

// ─── Post-Mortem: analiza por qué falló y ajusta pesos ───────────────────────
export function runPostMortem(
  entry: BrainEntry,
  exitPrice: number,
  fundingAtExit: number | null,
): { updatedEntry: BrainEntry; updatedWeights: BrainWeights } {
  const brain = loadBrain()

  // ── 1. Detectar qué indicadores fallaron ────────────────────────────────
  const failed: FailedIndicator[] = []
  const lessons: string[] = []
  const adjustments: string[] = []

  const pnlPct = entry.direction === 'long'
    ? ((exitPrice - entry.entry) / entry.entry) * 100
    : ((entry.entry - exitPrice) / entry.entry) * 100

  // Stop Hunt débil (score < 30)
  if (entry.scoreBreakdown.stopHuntScore < 30) {
    failed.push('stopHunt')
    lessons.push('El barrido de liquidez fue débil (mecha pequeña o sin swings múltiples).')
    adjustments.push('Incrementar umbral mínimo de mecha y exigir ≥2 swings barridos.')
  }

  // Order Block no válido o ausente
  if (entry.scoreBreakdown.orderBlockScore < 10) {
    failed.push('orderBlock')
    lessons.push('No había un Order Block institucional que respaldara la entrada.')
    adjustments.push('Incrementar peso al Order Block — no entrar sin OB fresco en rango.')
  }

  // Funding contrario a la dirección
  if (entry.scoreBreakdown.fundingScore < 0 || (fundingAtExit !== null && (
    (entry.direction === 'long' && fundingAtExit > 0.0005) ||
    (entry.direction === 'short' && fundingAtExit < -0.0005)
  ))) {
    failed.push('funding')
    lessons.push('El Funding Rate estaba en contra de la dirección en el momento de la salida.')
    adjustments.push('Reducir peso al indicador de funding cuando contradice la dirección principal.')
  }

  // Si no hay causas claras → falló la estructura general
  if (failed.length === 0) {
    failed.push('estructura')
    lessons.push('La estructura de mercado revirtió sin señales claras previas (posible volatilidad externa).')
    adjustments.push('Considerar contexto de mercado macro antes de activar señales de corto plazo.')
  }

  const postMortem: PostMortem = {
    failedIndicators: failed,
    lesson: lessons.join(' '),
    ajuste: adjustments.join(' '),
    fundingAtExit,
    volumeAtEntry: 0, // se completa desde el hook con el volumen real
    marketCondition: buildScenarioTag(entry),
  }

  // ── 2. Ajustar pesos (gradualmente, máx ±15% por fallo) ──────────────────
  const w = { ...brain.weights }
  const DECAY  = 0.92   // reducción del peso al fallar
  const BOOST  = 1.05   // aumento del peso cuando no falló

  if (failed.includes('stopHunt'))   w.stopHuntWeight   = clamp(w.stopHuntWeight   * DECAY, 0.5, 1.5)
  else                               w.stopHuntWeight   = clamp(w.stopHuntWeight   * BOOST, 0.5, 1.5)

  if (failed.includes('orderBlock')) w.orderBlockWeight = clamp(w.orderBlockWeight * DECAY, 0.5, 1.5)
  else                               w.orderBlockWeight = clamp(w.orderBlockWeight * BOOST, 0.5, 1.5)

  if (failed.includes('funding'))    w.fundingWeight    = clamp(w.fundingWeight    * DECAY, 0.5, 1.5)
  else                               w.fundingWeight    = clamp(w.fundingWeight    * BOOST, 0.5, 1.5)

  // Endurecer umbral de mecha si el SH fue débil
  if (failed.includes('stopHunt'))   w.minWickPct = clamp(w.minWickPct * 1.1, 0.05, 0.5)

  w.lastUpdated = Date.now()
  brain.weights = w
  saveBrain(brain)

  const updatedEntry: BrainEntry = {
    ...entry,
    resultado: 'SL_tocado',
    exitPrice,
    pnlPct,
    postMortem,
  }

  return { updatedEntry, updatedWeights: w }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function buildScenarioTag(entry: BrainEntry): string {
  const parts: string[] = []
  if (entry.scoreBreakdown.fundingScore > 10)   parts.push('HighFunding')
  if (entry.scoreBreakdown.stopHuntScore > 35)   parts.push('StrongSH')
  else                                           parts.push('WeakSH')
  if (entry.scoreBreakdown.orderBlockScore > 20) parts.push('FreshOB')
  parts.push(entry.direction === 'long' ? 'Long' : 'Short')
  return parts.join('_')
}

function recalcStats(entries: BrainEntry[]) {
  const closed = entries.filter(e => e.resultado !== 'abierta' && e.pnlPct !== null)
  const wins   = closed.filter(e => (e.pnlPct ?? 0) > 0)
  const losses = closed.filter(e => (e.pnlPct ?? 0) <= 0)
  const avgPnl = closed.length > 0
    ? closed.reduce((s, e) => s + (e.pnlPct ?? 0), 0) / closed.length
    : 0
  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    avgPnlPct: avgPnl,
  }
}
