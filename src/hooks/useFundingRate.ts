/**
 * Hook: Funding Rate en tiempo real de Binance Futures
 * Stream: wss://fstream.binance.com/ws/btcusdt@markPrice
 * Actualización: cada ~3 segundos
 */
import { useEffect, useRef, useState } from 'react'

export interface FundingRateData {
  fundingRate: number | null       // valor crudo (e.g. 0.0001 = 0.01%)
  fundingRatePct: number | null    // en porcentaje
  nextFundingTime: number | null   // timestamp Unix ms
  markPrice: number | null
  indexPrice: number | null
  connected: boolean
}

const FUTURES_WS = 'wss://fstream.binance.com/ws/btcusdt@markPrice'

export function useFundingRate(): FundingRateData {
  const [data, setData] = useState<FundingRateData>({
    fundingRate: null, fundingRatePct: null,
    nextFundingTime: null, markPrice: null, indexPrice: null,
    connected: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const mountedRef = useRef(true)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function connect() {
    if (wsRef.current) wsRef.current.close()

    const ws = new WebSocket(FUTURES_WS)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setData(prev => ({ ...prev, connected: true }))
    }

    ws.onmessage = (e: MessageEvent) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>
        const fr = parseFloat(msg['r'] as string)
        setData({
          fundingRate: fr,
          fundingRatePct: fr * 100,
          nextFundingTime: msg['T'] as number,
          markPrice: parseFloat(msg['p'] as string),
          indexPrice: parseFloat(msg['i'] as string),
          connected: true,
        })
      } catch { /* ignorar */ }
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setData(prev => ({ ...prev, connected: false }))
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setData(prev => ({ ...prev, connected: false }))
      retryRef.current = setTimeout(() => { if (mountedRef.current) connect() }, 5000)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [])

  return data
}
