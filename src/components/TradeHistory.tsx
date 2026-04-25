/**
 * TradeHistory — tabla dark-neon con el historial completo.
 * Muestra: trade activo (desde sim state) + historial del brain (SL y wins inesperados).
 */
import { useState, useEffect } from 'react'
import { loadTradesLog } from '../utils/brainStorage'
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
  const res    = resultLabel(entry.resultado)
  const isOpen = entry.resultado === 'abierta'

  // PnL en vivo para el trade abierto
  const livePnl = isOpen && livePrice
    ? (entry.direction === 'long'
        ? ((livePrice - entry.entry) / entry.entry) * 100
        : ((entry.entry - livePrice) / entry.entry) * 100)
    : entry.pnlPct

  return (
    <tr className={`border-b border-dark-border hover:bg-white/[0.02] transition-colors ${isOpen ? 'bg-neon-yellow/[0.03]' : ''}`}>
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
        {timeStr(entry.timestamp)}
      </td>
    </tr>
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
  const wins  = closedEntries.filter(e => e.resultado !== 'SL_tocado').length
  const total = closedEntries.length
  const wr    = total > 0 ? Math.round((wins / total) * 100) : null

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
              <span className="text-gray-700 ml-1">({wins}/{total})</span>
            </span>
          )}
          <span className="text-gray-700">{total} trades</span>
        </div>
      </div>

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
