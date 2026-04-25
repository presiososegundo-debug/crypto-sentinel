/**
 * CandleChart — lightweight-charts v5
 *
 * Sincronización correcta REST → WS:
 *   1. Cambio de timeframe → removeSeries + addSeries (limpia residuos)
 *      → prevKlineCountRef = 0  → el efecto de klines llama setData()
 *   2. klines llega (200 velas REST) → setData() + fitContent()
 *   3. currentKline (WS live) → update() sobre el historial ya pintado
 */
import { useEffect, useRef } from 'react'
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickSeriesOptions,
  type UTCTimestamp,
  type IPriceLine,
  type SeriesMarker,
  LineStyle,
} from 'lightweight-charts'
import type { Kline } from '../types/market'
import type { OrderBlock, AnalysisSignal } from '../types/analysis'
import type { Timeframe } from '../hooks/useBinanceWS'

const CONFIDENCE_THRESHOLD = 76

interface TradeLevels {
  entry: number | null
  sl:    number | null
  tp1:   number | null
  tp2:   number | null
  tp3:   number | null
}

interface Props {
  klines:      Kline[]
  currentKline: Kline | null
  orderBlocks: OrderBlock[]
  signal:      AnalysisSignal | null
  timeframe:   Timeframe
}

const SERIES_OPTS: Partial<CandlestickSeriesOptions> = {
  upColor:        '#00ff88',
  downColor:      '#ff3366',
  borderUpColor:  '#00ff88',
  borderDownColor:'#ff3366',
  wickUpColor:    '#00ff88',
  wickDownColor:  '#ff3366',
}

function makeLevelLines(
  series: ISeriesApi<'Candlestick'>,
  levels: TradeLevels,
  direction: 'long' | 'short',
): IPriceLine[] {
  const lines: IPriceLine[] = []

  if (levels.entry !== null)
    lines.push(series.createPriceLine({ price: levels.entry, color: '#ffffff', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '→ ENTRADA' }))

  if (levels.sl !== null)
    lines.push(series.createPriceLine({ price: levels.sl, color: '#ff3366', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: '✕ SL' }))

  const c1 = direction === 'long' ? '#86efac' : '#fca5a5'
  const c2 = direction === 'long' ? '#4ade80' : '#f87171'
  const c3 = direction === 'long' ? '#00ff88' : '#ff3366'

  if (levels.tp1 !== null)
    lines.push(series.createPriceLine({ price: levels.tp1, color: c1, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'TP1 · 0.618' }))
  if (levels.tp2 !== null)
    lines.push(series.createPriceLine({ price: levels.tp2, color: c2, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'TP2 · 1.0' }))
  if (levels.tp3 !== null)
    lines.push(series.createPriceLine({ price: levels.tp3, color: c3, lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: '🎯 TP3 · 1.618' }))

  return lines
}

export function CandleChart({ klines, currentKline, orderBlocks, signal, timeframe }: Props) {
  const containerRef     = useRef<HTMLDivElement>(null)
  const chartRef         = useRef<IChartApi | null>(null)
  const seriesRef        = useRef<ISeriesApi<'Candlestick'> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef       = useRef<ISeriesMarkersPluginApi<any> | null>(null)
  const priceLinesRef    = useRef<IPriceLine[]>([])
  const prevCountRef     = useRef(0)   // cuántas velas tiene el chart ahora mismo

  // ── 1. Crear chart una sola vez ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout:   { background: { color: '#0a0e1a' }, textColor: '#6b7280' },
      grid:     { vertLines: { color: '#111827' }, horzLines: { color: '#111827' } },
      crosshair:{ vertLine: { color: '#374151', width: 1, style: 2 }, horzLine: { color: '#374151', width: 1, style: 2 } },
      rightPriceScale: { borderColor: '#1f2937', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    chartRef.current = chart

    // Crear serie inicial
    const series = chart.addSeries(CandlestickSeries, SERIES_OPTS)
    seriesRef.current = series
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markersRef.current = createSeriesMarkers<any>(series, [])

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current   = null
      seriesRef.current  = null
      markersRef.current = null
      priceLinesRef.current = []
      prevCountRef.current  = 0
    }
  }, [])

  // ── 2. Cambio de timeframe → recrear serie (clear residuos) ───────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    // Limpiar price lines (pertenecen a la serie anterior)
    priceLinesRef.current = []
    // Quitar serie vieja
    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current) } catch { /* ignorar */ }
    }
    // Nueva serie limpia
    const series = chart.addSeries(CandlestickSeries, SERIES_OPTS)
    seriesRef.current  = series
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markersRef.current = createSeriesMarkers<any>(series, [])
    // Reset contador → garantiza que el próximo setKlines llame a setData()
    prevCountRef.current = 0

    console.log(`[CandleChart] Serie recreada para timeframe ${timeframe}`)
  // Solo react a cambios de timeframe, no al montaje inicial
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe])

  // ── 3. Cargar / actualizar historial REST ──────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || klines.length === 0) return

    const data = klines.map(k => ({
      time:  k.time  as UTCTimestamp,
      open:  k.open,
      high:  k.high,
      low:   k.low,
      close: k.close,
    }))

    if (prevCountRef.current === 0) {
      // Carga inicial o cambio de timeframe → setData completo
      series.setData(data)
      chartRef.current?.timeScale().fitContent()
      console.log(`[CandleChart] Velas cargadas: ${data.length} (timeframe: ${timeframe})`)
    } else if (klines.length > prevCountRef.current) {
      // Nueva vela cerrada vía WS → solo update incremental
      series.update(data[data.length - 1])
    }

    prevCountRef.current = klines.length
  }, [klines, timeframe])

  // ── 4. Vela live del WebSocket ─────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || !currentKline || prevCountRef.current === 0) return
    series.update({
      time:  currentKline.time  as UTCTimestamp,
      open:  currentKline.open,
      high:  currentKline.high,
      low:   currentKline.low,
      close: currentKline.close,
    })
  }, [currentKline])

  // ── 5. Marcador Stop Hunt ─────────────────────────────────────────────────
  useEffect(() => {
    const plugin = markersRef.current
    if (!plugin) return
    const hunt = signal?.stopHunt ?? null
    if (!hunt) { plugin.setMarkers([]); return }
    const markers: SeriesMarker<UTCTimestamp>[] = [{
      time:     hunt.time as UTCTimestamp,
      position: hunt.direction === 'bullish' ? 'belowBar' : 'aboveBar',
      color:    hunt.direction === 'bullish' ? '#a78bfa'  : '#f97316',
      shape:    hunt.direction === 'bullish' ? 'arrowUp'  : 'arrowDown',
      text:     `SH${hunt.strength > 1 ? ' ★'.repeat(hunt.strength) : ''}`,
      size:     1.5,
    }]
    plugin.setMarkers(markers)
  }, [signal?.stopHunt])

  // ── 6. Price lines SL / TPs ───────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    priceLinesRef.current.forEach(l => { try { series.removePriceLine(l) } catch { /* */ } })
    priceLinesRef.current = []

    const dir = signal?.direction
    if ((signal?.score ?? 0) < CONFIDENCE_THRESHOLD || !dir || dir === 'neutral') return
    if (!signal?.suggestedEntry) return

    priceLinesRef.current = makeLevelLines(
      series,
      { entry: signal.suggestedEntry, sl: signal.suggestedSL, tp1: signal.suggestedTP1, tp2: signal.suggestedTP2, tp3: signal.suggestedTP3 },
      dir,
    )
  }, [signal])

  // ── Render ────────────────────────────────────────────────────────────────
  const showLevels = (signal?.score ?? 0) >= CONFIDENCE_THRESHOLD && signal?.direction !== 'neutral'
  const dir        = signal?.direction

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* OB badges */}
      {orderBlocks.length > 0 && (
        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
          {orderBlocks.slice(0, 3).map((ob, i) => (
            <div key={i} className={`text-xs px-2 py-0.5 rounded font-mono backdrop-blur-sm border ${
              ob.type === 'bullish'
                ? 'bg-neon-green/10 text-neon-green border-neon-green/20'
                : 'bg-neon-red/10 text-neon-red border-neon-red/20'
            }`}>
              OB {ob.type === 'bullish' ? '↑' : '↓'} ${ob.bottom.toFixed(0)}–${ob.top.toFixed(0)}
              {!ob.tested && <span className="ml-1 text-yellow-400 opacity-80">★</span>}
            </div>
          ))}
        </div>
      )}

      {/* Signal badge */}
      {showLevels && signal && (
        <div className="absolute top-2 right-2 pointer-events-none">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider backdrop-blur-sm border ${
            dir === 'long'
              ? 'bg-neon-green/15 border-neon-green/40 text-neon-green'
              : 'bg-neon-red/15 border-neon-red/40 text-neon-red'
          }`}>
            {dir === 'long' ? '▲ LONG' : '▼ SHORT'}
            <span className="ml-2 opacity-60">Score {signal.score}</span>
          </div>
        </div>
      )}

      {/* Score insuficiente */}
      {!showLevels && signal && signal.score > 0 && (
        <div className="absolute top-2 right-2 pointer-events-none">
          <div className="px-2 py-1 rounded text-xs text-gray-600 bg-dark-bg/70 border border-dark-border backdrop-blur-sm">
            Score {signal.score} · umbral {CONFIDENCE_THRESHOLD}
          </div>
        </div>
      )}
    </div>
  )
}
