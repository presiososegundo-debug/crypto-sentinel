export interface Kline {
  time: number        // Unix timestamp en segundos
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Ticker {
  symbol: string
  price: number
  priceChange: number
  priceChangePercent: number
  high24h: number
  low24h: number
  volume24h: number
  quoteVolume24h: number
  timestamp: number
}

export interface AggTrade {
  price: number
  quantity: number
  isBuyerMaker: boolean
  timestamp: number
}

export interface WSConnectionState {
  kline: 'connecting' | 'connected' | 'disconnected' | 'error'
  ticker: 'connecting' | 'connected' | 'disconnected' | 'error'
}
