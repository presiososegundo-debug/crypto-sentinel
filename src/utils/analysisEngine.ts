/**
 * CRYPTO SENTINEL — Motor de Análisis Maquiavélico
 * Reglas: Stop Hunt → Order Block → Funding Rate
 */
import type { Kline } from '../types/market'
import type {
  SwingPoint,
  StopHunt,
  OrderBlock,
  FairValueGap,
  AnalysisSignal,
  MarketContext,
} from '../types/analysis'
import type { BrainWeights } from '../types/brain'
import { DEFAULT_WEIGHTS } from '../types/brain'

// ─── Constantes de calibración (valores base — los pesos del brain los escalan) ──
const SWING_LOOKBACK = 5       // velas a cada lado para confirmar swing
const OB_DISTANCE_MAX_PCT = 2  // OB válido si está a menos del 2% del precio
const FVG_MIN_SIZE_PCT = 0.05  // FVG mínimo 0.05%
const HIGH_FUNDING = 0.0005    // 0.05% — longs sobreextendidos
const LOW_FUNDING = -0.0005    // -0.05% — shorts sobreextendidos

// ─── 1. Detectar Swing Highs y Lows ──────────────────────────────────────────
export function detectSwings(klines: Kline[], lookback = SWING_LOOKBACK): SwingPoint[] {
  const swings: SwingPoint[] = []
  const len = klines.length

  for (let i = lookback; i < len - lookback; i++) {
    const candle = klines[i]
    let isSwingHigh = true
    let isSwingLow = true

    for (let j = 1; j <= lookback; j++) {
      if (klines[i - j].high >= candle.high) isSwingHigh = false
      if (klines[i + j].high > candle.high) isSwingHigh = false
      if (klines[i - j].low <= candle.low) isSwingLow = false
      if (klines[i + j].low < candle.low) isSwingLow = false
    }

    if (isSwingHigh) swings.push({ type: 'high', price: candle.high, time: candle.time, index: i })
    if (isSwingLow) swings.push({ type: 'low', price: candle.low, time: candle.time, index: i })
  }

  return swings
}

// ─── 2. Detectar Stop Hunt en las últimas velas ───────────────────────────────
export function detectStopHunt(klines: Kline[], swings: SwingPoint[], minWickPct = 0.08): StopHunt | null {
  if (klines.length < 3) return null

  const recentSwings = swings.slice(-20)
  const lastCandles = klines.slice(-5)

  for (let ci = lastCandles.length - 1; ci >= 0; ci--) {
    const candle = lastCandles[ci]
    const candleRange = candle.high - candle.low

    if (candleRange === 0) continue

    for (const swing of recentSwings) {
      if (swing.type !== 'low') continue
      if (swing.index >= klines.length - 5) continue

      const swept = candle.low < swing.price && candle.close > swing.price
      if (!swept) continue

      const wickSize = swing.price - candle.low
      const wickPct = (wickSize / swing.price) * 100

      if (wickPct < minWickPct) continue

      const strength = recentSwings.filter(
        s => s.type === 'low' && s.price > candle.low && s.price <= swing.price + swing.price * 0.001
      ).length

      return {
        direction: 'bullish',
        sweptPrice: swing.price,
        wickSize,
        sweepPercent: wickPct,
        candleIndex: klines.length - 5 + ci,
        time: candle.time,
        strength: Math.min(strength, 3),
      }
    }

    for (const swing of recentSwings) {
      if (swing.type !== 'high') continue
      if (swing.index >= klines.length - 5) continue

      const swept = candle.high > swing.price && candle.close < swing.price
      if (!swept) continue

      const wickSize = candle.high - swing.price
      const wickPct = (wickSize / swing.price) * 100

      if (wickPct < minWickPct) continue

      const strength = recentSwings.filter(
        s => s.type === 'high' && s.price < candle.high && s.price >= swing.price - swing.price * 0.001
      ).length

      return {
        direction: 'bearish',
        sweptPrice: swing.price,
        wickSize,
        sweepPercent: wickPct,
        candleIndex: klines.length - 5 + ci,
        time: candle.time,
        strength: Math.min(strength, 3),
      }
    }
  }

  return null
}

// ─── 3. Detectar Order Blocks activos ────────────────────────────────────────
export function detectOrderBlocks(klines: Kline[], currentPrice: number): OrderBlock[] {
  const obs: OrderBlock[] = []
  const len = klines.length
  const lookback = Math.min(50, len - 1)

  for (let i = len - lookback; i < len - 2; i++) {
    const curr = klines[i]
    const next = klines[i + 1]
    const isBullishOB = curr.close < curr.open && next.close > next.open && next.close > curr.high
    const isBearishOB = curr.close > curr.open && next.close < next.open && next.close < curr.low

    if (!isBullishOB && !isBearishOB) continue

    const type = isBullishOB ? 'bullish' : 'bearish'
    // Bullish OB: zona de demanda (low–high de la vela bajista que precedió el impulso)
    // Bearish OB: zona de oferta (low–high de la vela alcista que precedió el impulso)
    const top    = curr.high
    const bottom = curr.low

    // Verificar si el OB fue invalidado (precio cruzó completamente)
    let active = true
    let tested = false
    for (let j = i + 2; j < len; j++) {
      const c = klines[j]
      if (type === 'bullish' && c.low < bottom) { active = false; break }
      if (type === 'bearish' && c.high > top) { active = false; break }
      if (type === 'bullish' && c.low <= top) tested = true
      if (type === 'bearish' && c.high >= bottom) tested = true
    }

    if (!active) continue

    const mid = (top + bottom) / 2
    const distancePct = Math.abs((currentPrice - mid) / currentPrice) * 100

    if (distancePct > OB_DISTANCE_MAX_PCT) continue

    obs.push({ type, top, bottom, time: curr.time, candleIndex: i, active, tested, distancePct })
  }

  // Ordenar por cercanía al precio actual
  return obs.sort((a, b) => a.distancePct - b.distancePct).slice(0, 5)
}

// ─── 4. Detectar Fair Value Gaps ──────────────────────────────────────────────
export function detectFVGs(klines: Kline[], _currentPrice?: number): FairValueGap[] {
  const fvgs: FairValueGap[] = []
  const len = klines.length
  const lookback = Math.min(30, len - 2)

  for (let i = len - lookback; i < len - 2; i++) {
    const prev = klines[i]
    const next = klines[i + 2]

    // FVG Bullish: high de vela anterior < low de vela posterior (gap alcista)
    if (next.low > prev.high) {
      const size = next.low - prev.high
      const sizePct = (size / prev.high) * 100
      if (sizePct < FVG_MIN_SIZE_PCT) continue

      const filled = klines.slice(i + 2).some(c => c.low <= next.low && c.high >= prev.high)

      fvgs.push({
        type: 'bullish',
        top: next.low,
        bottom: prev.high,
        midpoint: (next.low + prev.high) / 2,
        time: klines[i + 1].time,
        candleIndex: i + 1,
        filled,
      })
    }

    // FVG Bearish: low de vela anterior > high de vela posterior (gap bajista)
    if (next.high < prev.low) {
      const size = prev.low - next.high
      const sizePct = (size / prev.low) * 100
      if (sizePct < FVG_MIN_SIZE_PCT) continue

      const filled = klines.slice(i + 2).some(c => c.high >= next.high && c.low <= prev.low)

      fvgs.push({
        type: 'bearish',
        top: prev.low,
        bottom: next.high,
        midpoint: (prev.low + next.high) / 2,
        time: klines[i + 1].time,
        candleIndex: i + 1,
        filled,
      })
    }
  }

  return fvgs.filter(f => !f.filled).slice(-5)
}

// ─── 5. Niveles de Fibonacci ──────────────────────────────────────────────────
export function calcFibonacci(high: number, low: number, direction: 'long' | 'short') {
  const range = high - low
  if (direction === 'long') {
    return {
      tp1: low + range * 0.618,
      tp2: low + range * 1.0,
      tp3: low + range * 1.618,
      sl: low - range * 0.1,
    }
  } else {
    return {
      tp1: high - range * 0.618,
      tp2: high - range * 1.0,
      tp3: high - range * 1.618,
      sl: high + range * 0.1,
    }
  }
}

// ─── 6. SCORE DE CONFLUENCIA (1-100) ─────────────────────────────────────────
function calcStopHuntScore(hunt: StopHunt | null, weight = 1.0): number {
  if (!hunt) return 0
  let score = 25
  score += (hunt.strength - 1) * 8
  if (hunt.sweepPercent > 0.2) score += 10
  if (hunt.sweepPercent > 0.5) score += 7
  return Math.min(Math.round(score * weight), 55)
}

function calcOBScore(ob: OrderBlock | null, weight = 1.0): number {
  if (!ob) return 0
  let score = 15
  if (!ob.tested) score += 10
  if (ob.distancePct < 0.3) score += 5
  return Math.min(Math.round(score * weight), 35)
}

function calcFundingScore(fundingRate: number | null, direction: 'long' | 'short' | 'neutral', weight = 1.0): number {
  if (fundingRate === null || direction === 'neutral') return 0

  const absFunding = Math.abs(fundingRate)
  let score = 0

  if (direction === 'long' && fundingRate < LOW_FUNDING) {
    score = Math.min(20, Math.floor((absFunding / 0.001) * 20))
  } else if (direction === 'short' && fundingRate > HIGH_FUNDING) {
    score = Math.min(20, Math.floor((absFunding / 0.001) * 20))
  } else if (absFunding > 0.0001) {
    score = -5
  }

  return Math.round(score * weight)
}

// ─── 7. Generar etiqueta de alerta humana ────────────────────────────────────
function buildLabel(score: number, hunt: StopHunt | null): string {
  if (score >= 76) return hunt ? '⚡ Trampa confirmada — Smart Money activo' : '✅ Alta confluencia detectada'
  if (score >= 41) return '⏳ Esperando confirmación — estructura débil'
  return '🚨 Trampa no confirmada — No operar'
}

function buildTooltip(
  hunt: StopHunt | null,
  ob: OrderBlock | null,
  fundingRate: number | null,
  direction: 'long' | 'short' | 'neutral'
): string {
  const parts: string[] = []

  if (hunt) {
    const dir = hunt.direction === 'bullish' ? 'mínimos' : 'máximos'
    parts.push(`El Smart Money barrió los ${dir} en $${hunt.sweptPrice.toFixed(0)} (mecha de ${hunt.sweepPercent.toFixed(2)}%) para cazar stops y acumular posiciones.`)
  } else {
    parts.push('No se detectó barrido de liquidez reciente. El precio no ha activado un Stop Hunt.')
  }

  if (ob) {
    const obDir = ob.type === 'bullish' ? 'compra' : 'venta'
    parts.push(`Hay una zona de ${obDir} institucional (Order Block) a ${ob.distancePct.toFixed(2)}% del precio actual — es donde el Smart Money dejó sus órdenes pendientes.`)
  }

  if (fundingRate !== null) {
    const fr = (fundingRate * 100).toFixed(4)
    if (fundingRate > HIGH_FUNDING) parts.push(`Funding Rate alto (${fr}%): los longs están sobreextendidos — el mercado podría atrapar compradores.`)
    else if (fundingRate < LOW_FUNDING) parts.push(`Funding Rate bajo (${fr}%): los shorts están sobreextendidos — posible trampa para bajistas.`)
    else parts.push(`Funding Rate neutro (${fr}%): sin sesgo de sentimiento extremo.`)
  }

  if (direction !== 'neutral') parts.push(`Señal actual: ${direction === 'long' ? '📈 LONG' : '📉 SHORT'}.`)

  return parts.join(' ')
}

// ─── 8. PUNTO DE ENTRADA PRINCIPAL ───────────────────────────────────────────
export function runAnalysis(ctx: MarketContext, weights: BrainWeights = DEFAULT_WEIGHTS): AnalysisSignal {
  const { klines, currentPrice, fundingRate } = ctx

  if (klines.length < 20) {
    return {
      direction: 'neutral', score: 0,
      label: 'Cargando datos...', tooltip: 'Esperando suficientes velas para analizar.',
      stopHunt: null, nearestOB: null, nearestFVG: null,
      scoreBreakdown: { stopHuntScore: 0, orderBlockScore: 0, fundingScore: 0 },
      suggestedEntry: null, suggestedSL: null,
      suggestedTP1: null, suggestedTP2: null, suggestedTP3: null,
      timestamp: Date.now(),
    }
  }

  // Detectar estructuras usando el minWickPct adaptativo del brain
  const swings = detectSwings(klines)
  const hunt = detectStopHunt(klines, swings, weights.minWickPct)
  const obs = detectOrderBlocks(klines, currentPrice)
  const fvgs = detectFVGs(klines, currentPrice)

  // Determinar dirección a partir del Stop Hunt
  let direction: 'long' | 'short' | 'neutral' = 'neutral'
  if (hunt) direction = hunt.direction === 'bullish' ? 'long' : 'short'

  // Buscar el OB más relevante para la dirección
  const nearestOB = obs.find(o => o.type === (direction === 'long' ? 'bullish' : 'bearish')) ?? obs[0] ?? null
  const nearestFVG = fvgs.find(f => f.type === (direction === 'long' ? 'bullish' : 'bearish')) ?? null

  // Calcular scores aplicando pesos adaptativos del brain
  const stopHuntScore  = calcStopHuntScore(hunt, weights.stopHuntWeight)
  const orderBlockScore = calcOBScore(nearestOB, weights.orderBlockWeight)
  const fundingScore   = calcFundingScore(fundingRate, direction, weights.fundingWeight)
  const rawScore = stopHuntScore + orderBlockScore + fundingScore
  const score = Math.max(1, Math.min(100, rawScore))

  // Calcular niveles de Fibonacci
  let fibs = { tp1: null as number | null, tp2: null as number | null, tp3: null as number | null, sl: null as number | null }
  if (hunt && direction !== 'neutral') {
    const recentHigh = Math.max(...klines.slice(-20).map(c => c.high))
    const recentLow = Math.min(...klines.slice(-20).map(c => c.low))
    const f = calcFibonacci(recentHigh, recentLow, direction)
    fibs = { tp1: f.tp1, tp2: f.tp2, tp3: f.tp3, sl: f.sl }
  }

  return {
    direction,
    score,
    label: buildLabel(score, hunt),
    tooltip: buildTooltip(hunt, nearestOB, fundingRate, direction),
    stopHunt: hunt,
    nearestOB,
    nearestFVG,
    scoreBreakdown: { stopHuntScore, orderBlockScore, fundingScore },
    suggestedEntry: hunt ? currentPrice : null,
    suggestedSL: fibs.sl,
    suggestedTP1: fibs.tp1,
    suggestedTP2: fibs.tp2,
    suggestedTP3: fibs.tp3,
    timestamp: Date.now(),
  }
}
