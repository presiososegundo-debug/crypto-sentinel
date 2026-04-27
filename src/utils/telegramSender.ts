const BOT_TOKEN = '7829913842:AAEQ2HL4Pq8qjtJLJ7fUmVjM34D-JHT7LbY'
const CHAT_ID   = '8595558820'

const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`

export interface TradeTelegramPayload {
  direction: 'long' | 'short'
  entry:     number
  sl:        number
  tp1:       number
  tp2:       number | null
  tp3:       number | null
  score:     number
  resultado?: string
  pnlPct?:   number | null
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export async function notificarApertura(trade: TradeTelegramPayload): Promise<void> {
  const dir  = trade.direction === 'long' ? '▲ LONG' : '▼ SHORT'
  const emoji = trade.direction === 'long' ? '🟢' : '🔴'

  const text = [
    `${emoji} *NUEVA OPERACIÓN — ${dir}*`,
    ``,
    `📍 Entrada:  \`$${fmt(trade.entry)}\``,
    `🛑 SL:       \`$${fmt(trade.sl)}\``,
    `🎯 TP1:      \`$${fmt(trade.tp1)}\``,
    trade.tp2 !== null ? `🎯 TP2:      \`$${fmt(trade.tp2)}\`` : null,
    trade.tp3 !== null ? `🎯 TP3:      \`$${fmt(trade.tp3)}\`` : null,
    ``,
    `📊 Score:    *${trade.score}*`,
  ].filter(Boolean).join('\n')

  await sendMessage(text)
}

export async function notificarCierre(trade: TradeTelegramPayload): Promise<void> {
  const pnl     = trade.pnlPct ?? 0
  const emoji   = pnl >= 0 ? '✅' : '❌'
  const sign    = pnl >= 0 ? '+' : ''
  const res     = trade.resultado ?? 'cerrado'

  const text = [
    `${emoji} *CIERRE — ${res.toUpperCase()}*`,
    ``,
    `📍 Entrada:  \`$${fmt(trade.entry)}\``,
    `📤 Salida:   \`$${fmt(trade.sl)}\``,
    ``,
    `💰 PnL:      *${sign}${pnl.toFixed(2)}%*`,
  ].join('\n')

  await sendMessage(text)
}

async function sendMessage(text: string): Promise<void> {
  try {
    await fetch(BASE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
    })
  } catch {
    // Silencioso — Telegram es opcional, no debe romper la app
  }
}
