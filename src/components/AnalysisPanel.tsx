/**
 * AnalysisPanel — Panel principal de señales maquiavélicas
 * Muestra: alerta cínica, gauge, breakdown, niveles Fibo
 */
import { useState } from 'react'
import type { AnalysisSignal } from '../types/analysis'
import { SentimentGauge } from './SentimentGauge'

// ─── Narrativa Maquiavélica ───────────────────────────────────────────────────
// Devuelve { headline, body, color } según el estado del mercado
function getMachiavellianNarrative(signal: AnalysisSignal | null): {
  headline: string
  body: string
  color: string
} {
  if (!signal || signal.score === 0) {
    return {
      headline: 'Observando a las ballenas...',
      body: 'El mercado aún no muestra sus cartas. Los Market Makers están eligiendo a sus víctimas.',
      color: '#6b7280',
    }
  }

  const { score, direction, stopHunt, nearestOB, scoreBreakdown } = signal
  const hasStrongSH = stopHunt !== null && stopHunt.strength >= 2
  const hasSH       = stopHunt !== null
  const hasOB       = nearestOB !== null && !nearestOB.tested
  const highFunding = Math.abs(scoreBreakdown.fundingScore) > 10

  // ── Score alto + Stop Hunt confirmado → entrada  ─────────────────────────
  if (score >= 76 && hasSH && hasOB) {
    const dir = direction === 'long' ? 'alcistas' : 'bajistas'
    return {
      headline: 'Sangre en el agua.',
      body: `La liquidez minorista ha sido barrida. Los ${dir} aficionados dejaron sus stops para que las ballenas se los comieran. Hora de seguir el dinero institucional.`,
      color: '#00ff88',
    }
  }

  if (score >= 76 && hasSH) {
    return {
      headline: 'Trampa armada. Smart Money operando.',
      body: 'El barrido de liquidez fue quirúrgico. Sin Order Block cercano, pero la estructura habla sola. El minorista acaba de financiar la próxima vela institucional.',
      color: '#00ff88',
    }
  }

  // ── Score medio-alto + acumulación ───────────────────────────────────────
  if (score >= 55 && hasOB && !hasSH) {
    return {
      headline: 'Acumulando liquidez...',
      body: 'Los Market Makers están preparando la trampa. El Order Block está fresco, sin testear. Falta que barran los stops antes de moverse.',
      color: '#ffcc00',
    }
  }

  if (score >= 55 && highFunding) {
    const side = scoreBreakdown.fundingScore > 0 ? 'longs' : 'shorts'
    return {
      headline: `Los ${side} están pagando la fiesta ajena.`,
      body: `El Funding Rate delata desequilibrio de sentimiento. Cuando los ${side} están sobreextendidos, el mercado suele devolverles el favor vaciando sus bolsillos.`,
      color: '#ffcc00',
    }
  }

  if (score >= 41 && hasStrongSH) {
    return {
      headline: 'Barrido detectado. Esperando estructura.',
      body: 'El Stop Hunt fue fuerte, múltiples swings barridos. El mercado mostró dónde está la liquidez. Falta confirmación de Order Block para entrar con convicción.',
      color: '#ffcc00',
    }
  }

  if (score >= 41) {
    return {
      headline: 'Hay movimiento, pero no es suficiente.',
      body: 'Las confluencias son débiles. Los peces pequeños se mueven, pero las ballenas aún no han dado señal. Esperar confirmación — el mercado premia la paciencia, no el FOMO.',
      color: '#ffcc00',
    }
  }

  // ── Score bajo ────────────────────────────────────────────────────────────
  if (hasSH && score < 41) {
    return {
      headline: 'Trampa detectada. No tocar.',
      body: 'Hay un barrido, pero sin respaldo institucional. Entrar aquí es regalar dinero al Market Maker. Las ballenas no han entrado — solo hay peces pequeños perdiendo el tiempo.',
      color: '#ff3366',
    }
  }

  return {
    headline: 'Las ballenas no han entrado.',
    body: 'Solo hay peces pequeños perdiendo el tiempo. Sin Stop Hunt, sin Order Block, sin desequilibrio de Funding. El mercado está eligiendo a quién castigar a continuación.',
    color: '#ff3366',
  }
}

interface Props {
  signal: AnalysisSignal | null
  currentPrice?: number
  fundingRatePct: number | null
}

function fmt(n: number | null, dec = 2): string {
  if (n === null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function FundingBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-500 text-xs">Conectando...</span>
  const color = pct > 0.05 ? 'text-neon-red' : pct < -0.05 ? 'text-neon-green' : 'text-neon-yellow'
  const label = pct > 0.05 ? '↑ Longs sobreexp.' : pct < -0.05 ? '↓ Shorts sobreexp.' : '→ Neutro'
  return (
    <span className={`text-xs font-mono font-bold ${color}`}>
      {pct.toFixed(4)}% {label}
    </span>
  )
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, (value / max) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span className="font-bold" style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-dark-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function AnalysisPanel({ signal, fundingRatePct }: Props) {
  const [showRaw, setShowRaw] = useState(false)

  const score = signal?.score ?? 0
  const isTrap = score < 41 && signal?.stopHunt !== null
  const isHigh = score >= 76

  const borderColor = score >= 76 ? '#00ff88' : score >= 41 ? '#ffcc00' : '#ff3366'
  const narrative   = getMachiavellianNarrative(signal)

  return (
    <div
      className="bg-dark-card rounded-xl p-4 space-y-4 border transition-all duration-700"
      style={{ borderColor, boxShadow: `0 0 24px ${borderColor}18` }}
    >
      {/* ── Narrativa maquiavélica ───────────────────────── */}
      <div
        className={`rounded-lg px-3 py-2.5 border ${
          isHigh  ? 'bg-neon-green/8 border-neon-green/30' :
          isTrap  ? 'bg-neon-red/8 border-neon-red/30 animate-pulse' :
                    'bg-neon-yellow/5 border-neon-yellow/20'
        }`}
      >
        <p className="text-xs font-black tracking-widest uppercase mb-1" style={{ color: narrative.color }}>
          {narrative.headline}
        </p>
        <p className="text-xs text-gray-400 leading-relaxed">
          {narrative.body}
        </p>
      </div>

      {/* ── Medidor Gauge ───────────────────────────────── */}
      <div className="flex justify-center">
        <SentimentGauge score={score} />
      </div>

      {/* ── Análisis técnico crudo (colapsable) ─────────── */}
      <div>
        <button
          onClick={() => setShowRaw(v => !v)}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
        >
          <span>{showRaw ? '▲' : '▼'}</span>
          {showRaw ? 'Ocultar análisis técnico' : 'Ver análisis técnico detallado'}
        </button>
        {showRaw && signal?.tooltip && (
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed bg-dark-border/30 rounded p-2 border border-dark-border">
            {signal.tooltip}
          </p>
        )}
      </div>

      {/* ── Breakdown del Score ─────────────────────────── */}
      {signal && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Confluencias</p>
          <ScoreBar
            label="🎯 Stop Hunt (Barrido)"
            value={signal.scoreBreakdown.stopHuntScore}
            max={50}
            color="#a78bfa"
          />
          <ScoreBar
            label="📦 Order Block"
            value={signal.scoreBreakdown.orderBlockScore}
            max={30}
            color="#60a5fa"
          />
          <ScoreBar
            label="💸 Funding Rate"
            value={Math.max(0, signal.scoreBreakdown.fundingScore)}
            max={20}
            color="#34d399"
          />
        </div>
      )}

      {/* ── Funding Rate ────────────────────────────────── */}
      <div className="flex justify-between items-center text-xs border-t border-dark-border pt-2">
        <span className="text-gray-500">Funding Rate</span>
        <FundingBadge pct={fundingRatePct} />
      </div>

      {/* ── Señal de Dirección ──────────────────────────── */}
      {signal?.direction !== 'neutral' && signal?.direction && (
        <div className={`rounded-lg p-3 text-center text-sm font-bold ${
          signal.direction === 'long'
            ? 'bg-neon-green/10 border border-neon-green/30 text-neon-green'
            : 'bg-neon-red/10 border border-neon-red/30 text-neon-red'
        }`}>
          {signal.direction === 'long' ? '📈 SEÑAL LONG' : '📉 SEÑAL SHORT'}
        </div>
      )}

      {/* ── Niveles de Fibonacci ────────────────────────── */}
      {signal?.suggestedEntry && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Niveles Fibonacci</p>
          <div className="grid grid-cols-2 gap-1 text-xs font-mono">
            <div className="bg-dark-border/50 rounded px-2 py-1">
              <span className="text-gray-500">Entrada</span>
              <p className="text-white font-bold">${fmt(signal.suggestedEntry)}</p>
            </div>
            <div className="bg-neon-red/10 rounded px-2 py-1">
              <span className="text-neon-red text-opacity-70">Stop Loss</span>
              <p className="text-neon-red font-bold">${fmt(signal.suggestedSL)}</p>
            </div>
            <div className="bg-neon-green/5 rounded px-2 py-1">
              <span className="text-neon-green/70">TP1 (0.618)</span>
              <p className="text-neon-green font-bold">${fmt(signal.suggestedTP1)}</p>
            </div>
            <div className="bg-neon-green/5 rounded px-2 py-1">
              <span className="text-neon-green/70">TP2 (1.0)</span>
              <p className="text-neon-green font-bold">${fmt(signal.suggestedTP2)}</p>
            </div>
            <div className="col-span-2 bg-neon-green/10 rounded px-2 py-1">
              <span className="text-neon-green/70">TP3 (1.618) 🎯</span>
              <p className="text-neon-green font-bold">${fmt(signal.suggestedTP3)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stop Hunt detectado ─────────────────────────── */}
      {signal?.stopHunt && (
        <div className="rounded-lg bg-purple-900/20 border border-purple-500/30 p-2.5 text-xs">
          <p className="text-purple-300 font-bold mb-1">
            ⚡ Stop Hunt {signal.stopHunt.direction === 'bullish' ? 'Bullish' : 'Bearish'} detectado
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-400">
            <span>Nivel barrido</span>
            <span className="text-white font-mono">${fmt(signal.stopHunt.sweptPrice)}</span>
            <span>Mecha</span>
            <span className="text-white font-mono">${fmt(signal.stopHunt.wickSize)} ({signal.stopHunt.sweepPercent.toFixed(3)}%)</span>
            <span>Fuerza</span>
            <span className="text-white">{'★'.repeat(signal.stopHunt.strength)}{'☆'.repeat(3 - signal.stopHunt.strength)}</span>
          </div>
        </div>
      )}

      {/* ── Order Block más cercano ─────────────────────── */}
      {signal?.nearestOB && (
        <div className="rounded-lg bg-blue-900/20 border border-blue-500/30 p-2.5 text-xs">
          <p className="text-blue-300 font-bold mb-1">
            📦 Order Block {signal.nearestOB.type === 'bullish' ? 'Bullish' : 'Bearish'}
            {signal.nearestOB.tested ? ' (testeado)' : ' (fresco)'}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-400">
            <span>Zona</span>
            <span className="text-white font-mono">${fmt(signal.nearestOB.bottom)} – ${fmt(signal.nearestOB.top)}</span>
            <span>Distancia</span>
            <span className="text-white">{signal.nearestOB.distancePct.toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}
