/**
 * BrainPanel — Fase 4: UI del sistema de aprendizaje
 * Muestra: operación abierta, último post-mortem, pesos actuales, historial
 */
import { useState } from 'react'
import { resetBrain } from '../utils/brainStorage'
import type { SimState } from '../hooks/useSimulator'
import type { BrainEntry, FailedIndicator } from '../types/brain'

interface Props {
  sim: SimState
  currentPrice: number
  onReset: () => void
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────
function PhaseBadge({ phase }: { phase: SimState['phase'] }) {
  const cfg = {
    idle:   { label: '○ En espera',    cls: 'text-gray-400 bg-gray-800 border-gray-700' },
    open:   { label: '● Operando',     cls: 'text-neon-yellow bg-yellow-900/30 border-yellow-600/40 animate-pulse' },
    closed: { label: '✓ Cerrada',      cls: 'text-neon-green bg-neon-green/10 border-neon-green/30' },
  }[phase]
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function WeightBar({ label, value, icon }: { label: string; value: number; icon: string }) {
  // value en rango 0.5 – 1.5 → mapeado a 0-100%
  const pct  = ((value - 0.5) / 1.0) * 100
  const color = value > 1.05 ? '#00ff88' : value < 0.95 ? '#ff3366' : '#ffcc00'
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-400">{icon} {label}</span>
        <span className="font-mono font-bold" style={{ color }}>×{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-dark-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function IndicatorTag({ ind }: { ind: FailedIndicator }) {
  const cfg: Record<FailedIndicator, { label: string; cls: string }> = {
    stopHunt:   { label: '⚡ Stop Hunt débil',   cls: 'bg-purple-900/40 text-purple-300 border-purple-700/40' },
    orderBlock: { label: '📦 OB ausente',         cls: 'bg-blue-900/40 text-blue-300 border-blue-700/40' },
    funding:    { label: '💸 Funding adverso',    cls: 'bg-orange-900/40 text-orange-300 border-orange-700/40' },
    estructura: { label: '📉 Estructura',          cls: 'bg-gray-800 text-gray-400 border-gray-700' },
    wyckoff:    { label: '🌊 Sin Spring/UTAD',    cls: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/40' },
  }
  const { label, cls } = cfg[ind]
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>
}

function TradeRow({ entry, current }: { entry: BrainEntry; current?: number }) {
  const isOpen  = entry.resultado === 'abierta'
  const isLoss  = entry.resultado === 'SL_tocado'
  const pnl     = isOpen && current
    ? (entry.direction === 'long'
        ? ((current - entry.entry) / entry.entry) * 100
        : ((entry.entry - current) / entry.entry) * 100)
    : (entry.pnlPct ?? null)

  const pnlColor = pnl === null ? 'text-gray-500' : pnl >= 0 ? 'text-neon-green' : 'text-neon-red'

  return (
    <div className={`px-2 py-1.5 rounded text-xs grid grid-cols-5 gap-1 items-center ${isLoss ? 'bg-neon-red/5 border border-neon-red/20' : isOpen ? 'bg-neon-yellow/5 border border-neon-yellow/20' : 'bg-dark-border/40'}`}>
      <span className={entry.direction === 'long' ? 'text-neon-green' : 'text-neon-red'}>
        {entry.direction === 'long' ? '▲' : '▼'} {entry.direction.toUpperCase()}
      </span>
      <span className="text-gray-400 font-mono">${entry.entry.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
      <span className="text-gray-500 text-center">{entry.score}</span>
      <span className={`text-center ${pnlColor} font-mono font-bold`}>
        {pnl !== null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%` : '—'}
      </span>
      <span className={`text-right ${isLoss ? 'text-neon-red' : isOpen ? 'text-neon-yellow' : 'text-gray-400'}`}>
        {isOpen ? 'ABIERTA' : entry.resultado}
      </span>
    </div>
  )
}

// ─── Panel principal ─────────────────────────────────────────────────────────
export function BrainPanel({ sim, currentPrice, onReset }: Props) {
  const [tab, setTab] = useState<'estado' | 'historial' | 'pesos'>('estado')

  const { brain, openTrade, lastClosed, lastSnapshot, snapshotState, adjustedScore, phase } = sim
  const weights = brain.weights
  const stats   = brain.stats

  function handleHardReset() {
    if (!confirm('¿Borrar todo el historial del brain? Esta acción no se puede deshacer.')) return
    resetBrain()
    onReset()
  }

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">🧠 Brain</span>
          <PhaseBadge phase={phase} />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Score ajustado: <span className={adjustedScore >= 76 ? 'text-neon-green font-bold' : 'text-neon-yellow'}>{adjustedScore}</span></span>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex border-b border-dark-border text-xs">
        {(['estado', 'historial', 'pesos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 capitalize transition-colors ${tab === t ? 'text-white border-b-2 border-neon-green' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3">

        {/* ══ TAB: ESTADO ════════════════════════════════════ */}
        {tab === 'estado' && (
          <>
            {/* Operación abierta */}
            {openTrade && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500 uppercase tracking-widest">Operación simulada activa</p>
                <TradeRow entry={openTrade} current={currentPrice} />
                <div className="grid grid-cols-3 gap-1 text-xs font-mono text-center">
                  <div className="bg-neon-red/10 rounded py-1">
                    <p className="text-neon-red text-opacity-60 text-xs">SL</p>
                    <p className="text-neon-red font-bold">${openTrade.sl.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-neon-green/5 rounded py-1">
                    <p className="text-neon-green/60 text-xs">TP1</p>
                    <p className="text-neon-green font-bold">${openTrade.tp1.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-neon-green/10 rounded py-1">
                    <p className="text-neon-green/60 text-xs">TP3</p>
                    <p className="text-neon-green font-bold">${(openTrade.tp3 ?? openTrade.tp1).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Último post-mortem */}
            {lastClosed?.postMortem && (
              <div className="rounded-lg bg-neon-red/5 border border-neon-red/20 p-2.5 space-y-1.5">
                <p className="text-xs font-bold text-neon-red">🔬 Post-Mortem — SL tocado</p>
                <div className="flex flex-wrap gap-1">
                  {lastClosed.postMortem.failedIndicators.map(ind => (
                    <IndicatorTag key={ind} ind={ind} />
                  ))}
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{lastClosed.postMortem.lesson}</p>
                <p className="text-xs text-gray-600 italic">{lastClosed.postMortem.ajuste}</p>
                <p className="text-xs text-gray-600">Escenario: <span className="text-gray-500 font-mono">{lastClosed.postMortem.marketCondition}</span></p>
              </div>
            )}

            {/* Snapshot processor */}
            <div className="rounded-lg bg-dark-border/30 p-2.5 space-y-1 text-xs">
              <p className="text-gray-500 uppercase tracking-widest">Snapshot Processor</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span className="text-gray-500">Snapshots totales</span>
                <span className="text-white font-mono text-right">{snapshotState.snapCount}</span>
                <span className="text-gray-500">Último trigger</span>
                <span className="text-gray-300 text-right">{snapshotState.lastTriggerReason || '—'}</span>
                {lastSnapshot && (
                  <>
                    <span className="text-gray-500">Vol. ratio</span>
                    <span className={`font-mono text-right ${lastSnapshot.volumeRatio >= 2 ? 'text-neon-yellow font-bold' : 'text-white'}`}>
                      ×{lastSnapshot.volumeRatio.toFixed(2)}
                    </span>
                    <span className="text-gray-500">Último precio</span>
                    <span className="text-white font-mono text-right">${lastSnapshot.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </>
                )}
              </div>
            </div>

            {/* Stats rápidas */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-dark-border/40 rounded p-2">
                <p className="text-gray-500">Trades</p>
                <p className="text-white font-bold">{stats.totalTrades}</p>
              </div>
              <div className="bg-dark-border/40 rounded p-2">
                <p className="text-gray-500">Win %</p>
                <p className={`font-bold ${stats.winRate >= 50 ? 'text-neon-green' : 'text-neon-red'}`}>
                  {stats.winRate.toFixed(0)}%
                </p>
              </div>
              <div className="bg-dark-border/40 rounded p-2">
                <p className="text-gray-500">Avg PnL</p>
                <p className={`font-bold font-mono ${stats.avgPnlPct >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                  {stats.avgPnlPct >= 0 ? '+' : ''}{stats.avgPnlPct.toFixed(2)}%
                </p>
              </div>
            </div>
          </>
        )}

        {/* ══ TAB: HISTORIAL ═════════════════════════════════ */}
        {tab === 'historial' && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-5 gap-1 text-xs text-gray-600 px-2 pb-1 border-b border-dark-border">
              <span>Dir</span><span>Entrada</span><span className="text-center">Score</span>
              <span className="text-center">PnL</span><span className="text-right">Result</span>
            </div>
            {brain.entries.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-4">Sin operaciones registradas aún</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {brain.entries.map(e => <TradeRow key={e.id} entry={e} />)}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: PESOS ═════════════════════════════════════ */}
        {tab === 'pesos' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Los pesos se ajustan automáticamente tras cada Post-Mortem.
              Rango: ×0.50 (penalizado) — ×1.50 (reforzado).
            </p>
            <WeightBar label="Stop Hunt"   value={weights.stopHuntWeight}   icon="⚡" />
            <WeightBar label="Order Block" value={weights.orderBlockWeight} icon="📦" />
            <WeightBar label="Funding Rate" value={weights.fundingWeight}   icon="💸" />
            <WeightBar label="Wyckoff S/U"  value={weights.wyckoffWeight}   icon="🌊" />

            <div className="flex justify-between text-xs border-t border-dark-border pt-2">
              <span className="text-gray-500">Umbral de mecha</span>
              <span className="text-white font-mono">{(weights.minWickPct).toFixed(3)}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">R:B mínimo</span>
              <span className={`font-mono ${(weights.minRR ?? 0.7) <= 0.40 ? 'text-neon-yellow' : 'text-gray-300'}`}>
                {(weights.minRR ?? 0.7).toFixed(2)}:1{(weights.minRR ?? 0.7) <= 0.40 ? ' ⚡ relajado' : ''}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Hold TP1→TP2</span>
              <span className={`font-mono ${weights.tp1HoldRate >= 0.60 ? 'text-neon-green font-bold' : 'text-gray-400'}`}>
                {(weights.tp1HoldRate * 100).toFixed(0)}%{weights.tp1HoldRate >= 0.60 ? ' ▶ saltando TP1' : ''}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Hold TP2→TP3</span>
              <span className={`font-mono ${weights.tp2HoldRate >= 0.60 ? 'text-neon-green font-bold' : 'text-gray-400'}`}>
                {(weights.tp2HoldRate * 100).toFixed(0)}%{weights.tp2HoldRate >= 0.60 ? ' ▶ saltando TP2' : ''}
              </span>
            </div>
            {weights.lastUpdated > 0 && (
              <p className="text-xs text-gray-600">
                Última actualización: {new Date(weights.lastUpdated).toLocaleTimeString()}
              </p>
            )}

            <button
              onClick={handleHardReset}
              className="w-full text-xs py-1.5 rounded border border-neon-red/30 text-neon-red/60 hover:text-neon-red hover:border-neon-red/60 transition-colors mt-2"
            >
              Resetear brain completo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
