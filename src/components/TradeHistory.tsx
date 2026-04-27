/**
 * TradeHistory — tabla dark-neon con el historial completo.
 * Muestra: trade activo (desde sim state) + historial del brain (SL y wins inesperados).
 */
import { useState, useEffect, useCallback } from 'react'
import { loadTradesLog, resetTradesLog } from '../utils/brainStorage'
import type { BrainEntry, TradeResult } from '../types/brain'

interface Props {
  openTrade: BrainEntry | null
  currentPrice: number
}

// ── helpers ────────────────────────────────────────────────────────────────

function resultLabel(r: TradeResult): { text: string; color: string } {
  switch (r) {
    case 'TP3':       return { text: '★ TP3',  color: 'text-neon-green' }
    case 'TP2':       return { text: '✓ TP2',  color: 'text-green-400'  }
    case 'TP1':       return { text: '~ TP1',  color: 'text-green-600'  }
    case 'SL_tocado': return { text: '✕ SL',   color: 'text-neon-red'   }
    case 'abierta':   return { text: '● VIVO', color: 'text-neon-yellow' }
    default:          return { text: r,        color: 'text-gray-500'   }
  }
}

function dirChip(dir: 'long' | 'short') {
  return dir === 'long'
    ? <span className="px-1.5 py-0.5 rounded text-neon-green bg-neon-green/10 border border-neon-green/20 text-[10px] font-bold tracking-wider">▲ LONG</span>
    : <span className="px-1.5 py-0.5 rounded text-neon-red   bg-neon-red/10   border border-neon-red/20   text-[10px] font-bold tracking-wider">▼ SHORT</span>
}

function pnlColor(pnl: number | null) {
  if (pnl === null) return 'text-gray-600'
  return pnl >= 0 ? 'text-neon-green' : 'text-neon-red'
}

function timeStr(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Row ────────────────────────────────────────────────────────────────────

function Row({ entry, livePrice }: { entry: BrainEntry; livePrice?: number }) {
  const [expanded, setExpanded] = useState(false)
  const res    = resultLabel(entry.resultado)
  const isOpen = entry.resultado === 'abierta'

  const livePnl = isOpen && livePrice
    ? (entry.direction === 'long'
        ? ((livePrice - entry.entry) / entry.entry) * 100
        : ((entry.entry - livePrice) / entry.entry) * 100)
    : entry.pnlPct

  return (
    <>
      <tr
        className={`border-b border-dark-border hover:bg-white/[0.03] transition-colors cursor-pointer select-none ${isOpen ? 'bg-neon-yellow/[0.03]' : ''} ${expanded ? 'border-b-0' : ''}`}
        onClick={() => setExpanded(v => !v)}
      >
        {/* ESTADO */}
        <td className="py-1.5 px-3 whitespace-nowrap">
          <span className={`font-bold text-xs ${res.color} ${isOpen ? 'animate-pulse' : ''}`}>{res.text}</span>
        </td>

        {/* PRECIO ENTRADA */}
        <td className="py-1.5 px-3 font-mono text-xs text-gray-300 whitespace-nowrap">
          ${entry.entry.toFixed(0)}
          {entry.exitPrice !== null && (
            <span className="text-gray-600 ml-1">→ ${entry.exitPrice.toFixed(0)}</span>
          )}
          {isOpen && livePrice && (
            <span className="text-gray-500 ml-1">→ ${livePrice.toFixed(0)}</span>
          )}
        </td>

        {/* TIPO */}
        <td className="py-1.5 px-3 whitespace-nowrap">
          {dirChip(entry.direction)}
        </td>

        {/* PROBABILIDAD */}
        <td className="py-1.5 px-3 text-xs font-mono whitespace-nowrap">
          <span className={entry.score >= 88 ? 'text-neon-green' : entry.score >= 76 ? 'text-green-400' : 'text-gray-500'}>
            {entry.score}
          </span>
        </td>

        {/* PnL */}
        <td className={`py-1.5 px-3 text-xs font-mono whitespace-nowrap ${pnlColor(livePnl)}`}>
          {livePnl !== null ? `${livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)}%` : '—'}
        </td>

        {/* FECHA */}
        <td className="py-1.5 px-3 text-[10px] text-gray-600 whitespace-nowrap hidden sm:table-cell">
          <span className="mr-1 text-gray-700">{expanded ? '▲' : '▼'}</span>
          {timeStr(entry.timestamp)}
        </td>
      </tr>

      {expanded && (
        <tr className={`border-b border-dark-border ${isOpen ? 'bg-neon-yellow/[0.02]' : 'bg-dark-bg/60'}`}>
          <td colSpan={6} className="px-3 pb-2 pt-1">
            <div className="grid grid-cols-5 gap-1.5 text-[10px]">
              {/* Entrada */}
              <div className="rounded px-2 py-1.5 bg-white/5 border border-white/10 text-center">
                <p className="text-gray-500 uppercase tracking-widest mb-0.5">Entrada</p>
                <p className="font-mono font-bold text-gray-200">${entry.entry.toFixed(0)}</p>
              </div>
              {/* SL */}
              <div className="rounded px-2 py-1.5 bg-neon-red/10 border border-neon-red/20 text-center">
                <p className="text-neon-red/70 uppercase tracking-widest mb-0.5">SL</p>
                <p className="font-mono font-bold text-neon-red">${entry.sl.toFixed(0)}</p>
              </div>
              {/* TP1 */}
              <div className="rounded px-2 py-1.5 bg-green-900/20 border border-green-700/30 text-center">
                <p className="text-green-600 uppercase tracking-widest mb-0.5">TP1</p>
                <p className="font-mono font-bold text-green-400">${entry.tp1.toFixed(0)}</p>
              </div>
              {/* TP2 */}
              <div className={`rounded px-2 py-1.5 text-center ${entry.tp2 !== null ? 'bg-green-900/30 border border-green-600/30' : 'bg-white/[0.02] border border-white/5'}`}>
                <p className="text-green-500 uppercase tracking-widest mb-0.5">TP2</p>
                <p className="font-mono font-bold text-green-300">{entry.tp2 !== null ? `$${entry.tp2.toFixed(0)}` : '—'}</p>
              </div>
              {/* TP3 */}
              <div className={`rounded px-2 py-1.5 text-center ${entry.tp3 !== null ? 'bg-neon-green/10 border border-neon-green/30' : 'bg-white/[0.02] border border-white/5'}`}>
                <p className="text-neon-green/60 uppercase tracking-widest mb-0.5">TP3</p>
                <p className="font-mono font-bold text-neon-green">{entry.tp3 !== null ? `$${entry.tp3.toFixed(0)}` : '—'}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export function TradeHistory({ openTrade, currentPrice }: Props) {
  const [logEntries, setLogEntries] = useState<BrainEntry[]>(() => loadTradesLog())

  useEffect(() => {
    function refresh() { setLogEntries(loadTradesLog()) }
    window.addEventListener('trades-log-updated', refresh)
    return () => window.removeEventListener('trades-log-updated', refresh)
  }, [])

  // El trade activo se muestra en vivo desde el simulador (precio en tiempo real)
  // El resto viene del log persistente (ya incluye el trade activo con resultado 'abierta')
  const allEntries = logEntries.map(e =>
    openTrade && e.id === openTrade.id ? openTrade : e
  )

  const closedEntries = allEntries.filter(e => e.resultado !== 'abierta')
  const wins   = closedEntries.filter(e => e.resultado !== 'SL_tocado').length
  const losses = closedEntries.filter(e => e.resultado === 'SL_tocado').length
  const total  = closedEntries.length
  const wr     = total > 0 ? Math.round((wins / total) * 100) : null

  // ROI realizado — solo trades cerrados
  const roiRealized = closedEntries.reduce((sum, e) => sum + (e.pnlPct ?? 0), 0)

  // ROI no realizado — trade abierto en vivo usando currentPrice
  const unrealizedPnl = openTrade
    ? openTrade.direction === 'long'
      ? ((currentPrice - openTrade.entry) / openTrade.entry) * 100
      : ((openTrade.entry - currentPrice) / openTrade.entry) * 100
    : null

  // ROI total = realizado + no realizado
  const roiTotal = roiRealized + (unrealizedPnl ?? 0)

  const color = (v: number) => v > 0 ? '#00ff88' : v < 0 ? '#ff3366' : '#6b7280'
  const sign  = (v: number) => v >= 0 ? '+' : ''

  const bestTrade = closedEntries.length > 0 ? Math.max(...closedEntries.map(e => e.pnlPct ?? 0)) : null
  const worstTrade = closedEntries.length > 0 ? Math.min(...closedEntries.map(e => e.pnlPct ?? 0)) : null

  return (
    <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border">
        <h3 className="text-xs text-gray-400 uppercase tracking-widest">
          Registro de Trades
          {openTrade && <span className="ml-2 text-neon-yellow animate-pulse">● operando</span>}
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {wr !== null && (
            <span>
              WR:{' '}
              <span className={wr >= 60 ? 'text-neon-green' : wr >= 40 ? 'text-neon-yellow' : 'text-neon-red'}>
                {wr}%
              </span>
              <span className="text-gray-700 ml-1">({wins}W / {losses}L)</span>
            </span>
          )}
          <span className="text-gray-700">{total} trades</span>
          <button
            onClick={() => {
              if (confirm('¿Resetear todo el historial de trades y el ROI a cero?')) resetTradesLog()
            }}
            className="text-gray-700 hover:text-neon-red transition-colors text-[10px] uppercase tracking-widest border border-gray-800 hover:border-neon-red/40 rounded px-1.5 py-0.5"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── Panel ROI ── */}
      {(total > 0 || openTrade) && (
        <div className="px-4 py-3 border-b border-dark-border bg-dark-bg/40 space-y-2">

          {/* ROI Total (número grande) */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-widest">ROI Total</span>
            <span
              className="text-2xl font-black font-mono tabular-nums"
              style={{ color: color(roiTotal), textShadow: `0 0 16px ${color(roiTotal)}60` }}
            >
              {sign(roiTotal)}{roiTotal.toFixed(2)}%
            </span>
          </div>

          {/* Desglose Realizado / No realizado */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-dark-border/40 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Realizado</p>
              <p className="font-mono font-bold tabular-nums text-sm" style={{ color: color(roiRealized) }}>
                {sign(roiRealized)}{roiRealized.toFixed(2)}%
              </p>
              <p className="text-[10px] text-gray-600">{total} trades cerrados</p>
            </div>
            <div className={`rounded-lg px-3 py-2 border ${openTrade ? 'border-neon-yellow/30 bg-neon-yellow/5' : 'bg-dark-border/40 border-transparent'}`}>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">No realizado</p>
              {unrealizedPnl !== null ? (
                <>
                  <p className="font-mono font-bold tabular-nums text-sm animate-pulse" style={{ color: color(unrealizedPnl) }}>
                    {sign(unrealizedPnl)}{unrealizedPnl.toFixed(2)}%
                  </p>
                  <p className="text-[10px] text-gray-600">en curso · live</p>
                </>
              ) : (
                <>
                  <p className="font-mono text-sm text-gray-600">—</p>
                  <p className="text-[10px] text-gray-700">sin posición abierta</p>
                </>
              )}
            </div>
          </div>

          {/* Mejor / Peor */}
          {total > 0 && (
            <div className="flex justify-between text-xs text-gray-600 pt-0.5">
              <span>Mejor: <span className="text-neon-green font-mono">{bestTrade !== null ? `${sign(bestTrade)}${bestTrade.toFixed(2)}%` : '—'}</span></span>
              <span>Peor: <span className="text-neon-red font-mono">{worstTrade !== null ? `${worstTrade.toFixed(2)}%` : '—'}</span></span>
            </div>
          )}
        </div>
      )}

      {/* ── Tabla con scroll ── */}
      <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
        {allEntries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-gray-700 tracking-widest uppercase">
            Sin operaciones registradas
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-dark-bg z-10">
              <tr className="border-b border-dark-border">
                {['ESTADO', 'PRECIO', 'TIPO', 'PROB', 'PnL', 'FECHA'].map(h => (
                  <th key={h} className="py-1.5 px-3 text-left text-[10px] text-gray-600 uppercase tracking-widest font-normal whitespace-nowrap last:hidden sm:last:table-cell">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allEntries.map(e => (
                <Row
                  key={e.id}
                  entry={e}
                  livePrice={e.resultado === 'abierta' ? currentPrice : undefined}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
