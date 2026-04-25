import { useEffect, useRef, useState } from 'react'
import type { AggTrade } from '../types/market'

interface TradeEntry extends AggTrade {
  id: number
}

let counter = 0

interface Props {
  lastTrade: AggTrade | null
}

export function TradesFeed({ lastTrade }: Props) {
  const [trades, setTrades] = useState<TradeEntry[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lastTrade) return
    setTrades(prev => {
      const next = [{ ...lastTrade, id: ++counter }, ...prev]
      return next.slice(0, 40)
    })
  }, [lastTrade])

  return (
    <div className="bg-dark-card border border-dark-border rounded-lg p-3 h-64 overflow-hidden">
      <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-2">Trades recientes</h3>
      <div ref={listRef} className="overflow-y-auto h-52 space-y-0.5 scrollbar-thin">
        {trades.map(t => (
          <div
            key={t.id}
            className={`flex justify-between text-xs font-mono px-1 py-0.5 rounded ${
              t.isBuyerMaker ? 'text-neon-red' : 'text-neon-green'
            }`}
          >
            <span>{t.isBuyerMaker ? '↓ SELL' : '↑ BUY'}</span>
            <span>${t.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span>{t.quantity.toFixed(5)} BTC</span>
          </div>
        ))}
      </div>
    </div>
  )
}
