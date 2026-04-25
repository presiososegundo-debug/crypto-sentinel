import { useState, useEffect, useRef, useMemo } from 'react'
import { useBinanceWS, type Timeframe } from '../hooks/useBinanceWS'
import { useFundingRate } from '../hooks/useFundingRate'
import { useAnalysis } from '../hooks/useAnalysis'
import { useSimulator } from '../hooks/useSimulator'
import { usePichoAudio } from '../hooks/usePichoAudio'
import { detectOrderBlocks, detectFVGs } from '../utils/analysisEngine'
import { ConnectionBadge } from './ConnectionBadge'
import { PriceHeader } from './PriceHeader'
import { TradesFeed } from './TradesFeed'
import { AnalysisPanel } from './AnalysisPanel'
import { CandleChart } from './CandleChart'
import { TradeSetupCard } from './TradeSetupCard'
import { BrainPanel } from './BrainPanel'
import { TimeframeSelector } from './TimeframeSelector'
import { TradeHistory } from './TradeHistory'

const SCORE_THRESHOLD = 76

export function Dashboard() {
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const { ticker, lastTrade, klines, currentKline, connectionState, isLoadingHistory, reconnect } = useBinanceWS(timeframe)
  const funding      = useFundingRate()
  const currentPrice = ticker?.price ?? 0

  const signal = useAnalysis({
    klines,
    currentPrice,
    fundingRate: funding.fundingRate,
    timeframe,
  })

  const { state: sim, reset: resetSim } = useSimulator(
    klines, currentKline, currentPrice, funding.fundingRate, signal,
  )

  const { playPichoAlert, volume, muted, toggleMute, adjustVolume } = usePichoAudio()

  // Disparar alerta cuando score supera umbral
  const prevAlertScoreRef = useRef<number>(0)
  useEffect(() => {
    const score = signal?.score ?? 0
    if (score >= SCORE_THRESHOLD && signal?.direction !== 'neutral') {
      if (score !== prevAlertScoreRef.current) {
        prevAlertScoreRef.current = score
      }
      playPichoAlert(score)
    } else {
      prevAlertScoreRef.current = 0
    }
  }, [signal?.score, signal?.direction, playPichoAlert])

  const { orderBlocks, fvgs } = useMemo(() => {
    if (klines.length < 20) return { orderBlocks: [], fvgs: [] }
    return {
      orderBlocks: detectOrderBlocks(klines, currentPrice),
      fvgs: detectFVGs(klines, currentPrice),
    }
  }, [klines, currentPrice])


  return (
    <div className="w-full min-h-screen bg-dark-bg text-white p-3 font-mono">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 gap-2">

        {/* Branding — ancho fijo para que no empuje al centro */}
        <div className="flex items-center gap-3 shrink-0" style={{ minWidth: '160px' }}>
          <div className="flex flex-col leading-none">
            <span className="text-base font-black tracking-[0.2em] text-neon-green" style={{ textShadow: '0 0 12px #00ff8860' }}>
              PICHOINDUSTRIES
            </span>
            <span className="text-xs text-gray-600 tracking-widest">BTC/USDT TACTICAL</span>
          </div>
        </div>

        {/* Centro: selector de temporalidad — crece libremente */}
        <div className="flex-1 flex justify-center">
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
        </div>

        {/* Bloque derecho — width fijo absoluto, nada puede desplazarlo */}
        <div
          className="shrink-0 flex items-center justify-end"
          style={{ width: '320px', gap: '10px' }}
        >
          {/* FR — width fijo para que el número no mueva nada */}
          <div
            className="hidden md:flex items-center gap-1 text-xs text-gray-500 tabular-nums"
            style={{ width: '100px', justifyContent: 'flex-end' }}
          >
            <span>FR:</span>
            <span className={
              (funding.fundingRatePct ?? 0) > 0.05  ? 'text-neon-red' :
              (funding.fundingRatePct ?? 0) < -0.05 ? 'text-neon-green' : 'text-neon-yellow'
            } style={{ display: 'inline-block', minWidth: '70px', textAlign: 'right' }}>
              {funding.fundingRatePct !== null ? `${funding.fundingRatePct.toFixed(4)}%` : '—'}
            </span>
          </div>

          {/* Volumen — width fijo, botones de tamaño fijo */}
          <div
            className="flex items-center select-none"
            style={{ width: '86px', gap: '2px' }}
          >
            <button
              onClick={() => adjustVolume(-0.2)}
              className="flex items-center justify-center text-gray-500 hover:text-gray-300 text-xs rounded hover:bg-white/5 transition-colors"
              style={{ width: '20px', height: '20px', flexShrink: 0 }}
              title="Bajar volumen"
            >−</button>
            <button
              onClick={toggleMute}
              className={`flex items-center justify-center text-sm rounded hover:bg-white/5 transition-colors ${muted || volume === 0 ? 'text-gray-600' : 'text-neon-green'}`}
              style={{ width: '24px', height: '24px', flexShrink: 0 }}
              title={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted || volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'}
            </button>
            <button
              onClick={() => adjustVolume(0.2)}
              className="flex items-center justify-center text-gray-500 hover:text-gray-300 text-xs rounded hover:bg-white/5 transition-colors"
              style={{ width: '20px', height: '20px', flexShrink: 0 }}
              title="Subir volumen"
            >+</button>
            <span
              className="text-gray-700 tabular-nums text-right text-[10px]"
              style={{ width: '20px', flexShrink: 0 }}
            >
              {muted ? '0' : Math.round(volume * 100)}
            </span>
          </div>

          {/* Badge — width fijo en el componente mismo */}
          <ConnectionBadge state={connectionState} onReconnect={reconnect} />
        </div>
      </div>

      {/* ── Precio ───────────────────────────────────────── */}
      <div className="bg-dark-card border border-dark-border rounded-lg px-4 py-3 mb-3">
        <PriceHeader ticker={ticker} />
      </div>

      {/* ── TradeSetupCard — aparece solo cuando score >= 76 ─────────────── */}
      <TradeSetupCard signal={signal} currentPrice={currentPrice} />

      {/* ── Layout principal: Chart + Panel lateral ────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 mt-3">

        {/* Gráfica (3/4 del ancho) */}
        <div
          className="xl:col-span-3 bg-dark-card rounded-lg overflow-hidden"
          style={{
            height: '460px',
            border: `1px solid ${signal && signal.score >= 76 && signal.direction !== 'neutral'
              ? signal.direction === 'long' ? '#00ff8840' : '#ff336640'
              : '#1f2937'}`,
            transition: 'border-color 0.6s ease',
          }}
        >
          {isLoadingHistory ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-gray-600">
                <div className="text-2xl mb-2 animate-spin">◌</div>
                <p className="text-xs tracking-widest uppercase">Cargando {timeframe}...</p>
              </div>
            </div>
          ) : klines.length > 0 ? (
            <CandleChart
              klines={klines}
              currentKline={currentKline}
              orderBlocks={orderBlocks}
              signal={signal}
              timeframe={timeframe}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-gray-600">
                <p className="text-xs tracking-widest uppercase">Sin datos</p>
              </div>
            </div>
          )}
        </div>

        {/* Panel lateral: análisis + brain */}
        <div className="xl:col-span-1 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: '460px' }}>
          <AnalysisPanel
            signal={signal}
            fundingRatePct={funding.fundingRatePct}
          />
          <BrainPanel
            sim={sim}
            currentPrice={currentPrice}
            onReset={resetSim}
          />
        </div>
      </div>

      {/* ── Fila inferior: Trades + Estructuras ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <div className="lg:col-span-1">
          <TradesFeed lastTrade={lastTrade} />
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {/* Order Blocks */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-3">
            <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-2">Order Blocks activos</h3>
            {orderBlocks.length === 0 ? (
              <p className="text-xs text-gray-600">Ninguno en rango (&lt;2%)</p>
            ) : (
              <div className="space-y-1">
                {orderBlocks.slice(0, 4).map((ob, i) => (
                  <div key={i} className={`flex justify-between text-xs px-2 py-1 rounded ${ob.type === 'bullish' ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-red/10 text-neon-red'}`}>
                    <span>{ob.type === 'bullish' ? '↑ Bull' : '↓ Bear'}{!ob.tested ? ' ★' : ''}</span>
                    <span className="font-mono">${ob.bottom.toFixed(0)}–${ob.top.toFixed(0)}</span>
                    <span className="text-gray-500">{ob.distancePct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FVGs */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-3">
            <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-2">Fair Value Gaps</h3>
            {fvgs.length === 0 ? (
              <p className="text-xs text-gray-600">Sin FVGs sin llenar</p>
            ) : (
              <div className="space-y-1">
                {fvgs.slice(-4).reverse().map((fvg, i) => (
                  <div key={i} className={`flex justify-between text-xs px-2 py-1 rounded ${fvg.type === 'bullish' ? 'bg-blue-900/30 text-blue-300' : 'bg-orange-900/30 text-orange-300'}`}>
                    <span>{fvg.type === 'bullish' ? '↑ FVG' : '↓ FVG'}</span>
                    <span className="font-mono">${fvg.bottom.toFixed(0)}–${fvg.top.toFixed(0)}</span>
                    <span className="text-gray-500">${fvg.midpoint.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Registro de Trades ───────────────────────────── */}
      <div className="mt-3">
        <TradeHistory openTrade={sim.openTrade} lastClosed={sim.lastClosed} currentPrice={currentPrice} />
      </div>

      {/* Footer */}
      <div className="mt-3 text-center text-xs text-gray-700">
        PICHOINDUSTRIES · v0.5 · {timeframe} · Brain activo · Post-Mortem · Snapshot Processing
      </div>
    </div>
  )
}
