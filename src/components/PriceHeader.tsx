import type { Ticker } from '../types/market'

interface Props {
  ticker: Ticker | null
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function PriceHeader({ ticker }: Props) {
  if (!ticker) {
    return (
      <div className="flex items-baseline gap-4 animate-pulse">
        <div className="h-10 w-48 bg-dark-border rounded" />
        <div className="h-5 w-20 bg-dark-border rounded" />
      </div>
    )
  }

  const isPositive = ticker.priceChangePercent >= 0
  const changeColor = isPositive ? 'text-neon-green' : 'text-neon-red'
  const sign = isPositive ? '+' : ''

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="text-4xl font-bold text-white font-mono">
        ${fmt(ticker.price)}
      </span>
      <span className={`text-lg font-semibold ${changeColor}`}>
        {sign}{fmt(ticker.priceChangePercent)}%
      </span>
      <span className={`text-sm ${changeColor}`}>
        {sign}{fmt(ticker.priceChange)}
      </span>
      <div className="flex gap-4 text-xs text-gray-400 ml-auto">
        <span>H: <span className="text-white">${fmt(ticker.high24h)}</span></span>
        <span>L: <span className="text-white">${fmt(ticker.low24h)}</span></span>
        <span>Vol: <span className="text-white">{fmt(ticker.volume24h, 0)} BTC</span></span>
      </div>
    </div>
  )
}
