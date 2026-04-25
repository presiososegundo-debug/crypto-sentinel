import { useEffect, useRef, useState, useCallback } from 'react'
import type { Kline, Ticker, AggTrade, WSConnectionState } from '../types/market'

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream?streams='
const SYMBOL          = 'btcusdt'
const REST_LIMIT      = 200   // velas históricas por fetch

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export interface BinanceWSData {
  klines: Kline[]
  currentKline: Kline | null
  ticker: Ticker | null
  lastTrade: AggTrade | null
  connectionState: WSConnectionState
  isLoadingHistory: boolean
  reconnect: () => void
}

function parseKlineREST(r: number[]): Kline {
  return {
    time:   Math.floor(r[0] / 1000),
    open:   parseFloat(String(r[1])),
    high:   parseFloat(String(r[2])),
    low:    parseFloat(String(r[3])),
    close:  parseFloat(String(r[4])),
    volume: parseFloat(String(r[5])),
  }
}

export function useBinanceWS(interval: Timeframe): BinanceWSData {
  const [klines, setKlines]           = useState<Kline[]>([])
  const [currentKline, setCurrentKline] = useState<Kline | null>(null)
  const [ticker, setTicker]           = useState<Ticker | null>(null)
  const [lastTrade, setLastTrade]     = useState<AggTrade | null>(null)
  const [isLoadingHistory, setIsLoading] = useState(true)
  const [connectionState, setConnectionState] = useState<WSConnectionState>({
    kline: 'connecting', ticker: 'connecting',
  })

  const wsRef           = useRef<WebSocket | null>(null)
  const retryRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef      = useRef(true)
  const intervalRef     = useRef<Timeframe>(interval)
  intervalRef.current   = interval

  // ─── Handlers de WS (sin cierre sobre `interval`) ────────────────────────
  const handleKline = useCallback((data: Record<string, unknown>) => {
    const k = data['k'] as Record<string, unknown>
    if (!k) return
    const kline: Kline = {
      time:   Math.floor((k['t'] as number) / 1000),
      open:   parseFloat(k['o'] as string),
      high:   parseFloat(k['h'] as string),
      low:    parseFloat(k['l'] as string),
      close:  parseFloat(k['c'] as string),
      volume: parseFloat(k['v'] as string),
    }
    setCurrentKline(kline)
    // Solo añadir al historial si la vela cerró
    if (k['x'] === true) {
      setKlines(prev => {
        // Evitar duplicado por tiempo
        if (prev.length > 0 && prev[prev.length - 1].time === kline.time) {
          return [...prev.slice(0, -1), kline]
        }
        return [...prev, kline].slice(-REST_LIMIT - 50)
      })
    }
  }, [])

  const handleMiniTicker = useCallback((data: Record<string, unknown>) => {
    const open  = parseFloat(data['o'] as string)
    const close = parseFloat(data['c'] as string)
    setTicker({
      symbol:             data['s'] as string,
      price:              close,
      priceChange:        close - open,
      priceChangePercent: ((close - open) / open) * 100,
      high24h:            parseFloat(data['h'] as string),
      low24h:             parseFloat(data['l'] as string),
      volume24h:          parseFloat(data['v'] as string),
      quoteVolume24h:     parseFloat(data['q'] as string),
      timestamp:          data['E'] as number,
    })
  }, [])

  const handleAggTrade = useCallback((data: Record<string, unknown>) => {
    setLastTrade({
      price:        parseFloat(data['p'] as string),
      quantity:     parseFloat(data['q'] as string),
      isBuyerMaker: data['m'] as boolean,
      timestamp:    data['T'] as number,
    })
  }, [])

  // ─── Conexión WS ──────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    setConnectionState({ kline: 'connecting', ticker: 'connecting' })

    const streams = [
      `${SYMBOL}@kline_${intervalRef.current}`,
      `${SYMBOL}@miniTicker`,
      `${SYMBOL}@aggTrade`,
    ].join('/')

    const ws = new WebSocket(`${BINANCE_WS_BASE}${streams}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnectionState({ kline: 'connected', ticker: 'connected' })
    }
    ws.onmessage = (e: MessageEvent) => {
      if (!mountedRef.current) return
      try {
        const { stream, data } = JSON.parse(e.data as string) as {
          stream: string; data: Record<string, unknown>
        }
        if (stream.includes('@kline'))      handleKline(data)
        else if (stream.includes('@miniTicker')) handleMiniTicker(data)
        else if (stream.includes('@aggTrade'))   handleAggTrade(data)
      } catch { /* ignorar parse errors */ }
    }
    ws.onerror = () => {
      if (!mountedRef.current) return
      setConnectionState({ kline: 'error', ticker: 'error' })
    }
    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnectionState({ kline: 'disconnected', ticker: 'disconnected' })
      retryRef.current = setTimeout(() => { if (mountedRef.current) connect() }, 3000)
    }
  }, [handleKline, handleMiniTicker, handleAggTrade])

  // ─── Efecto principal: re-corre en cada cambio de timeframe ──────────────
  useEffect(() => {
    mountedRef.current = true

    // 1. Limpiar estado anterior inmediatamente para que la UI muestre spinner
    setKlines([])
    setCurrentKline(null)
    setIsLoading(true)

    // 2. Fetch REST primero — 200 velas cerradas
    async function fetchHistory() {
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${REST_LIMIT}`
        const res  = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw  = await res.json() as number[][]
        if (!mountedRef.current) return
        setKlines(raw.map(parseKlineREST))
      } catch (err) {
        console.error('[BinanceWS] REST fetch error:', err)
      } finally {
        if (mountedRef.current) setIsLoading(false)
      }
    }

    // 3. WS arranca en paralelo — actualiza la vela en curso
    fetchHistory()
    connect()

    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  // connect es estable (useCallback sin deps variables), interval es la única dep real
  }, [interval, connect])

  return { klines, currentKline, ticker, lastTrade, connectionState, isLoadingHistory, reconnect: connect }
}
