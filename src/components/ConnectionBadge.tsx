import type { WSConnectionState } from '../types/market'

interface Props {
  state: WSConnectionState
  onReconnect: () => void
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-neon-green text-black',
  connecting: 'bg-neon-yellow text-black animate-pulse',
  disconnected: 'bg-gray-500 text-white',
  error: 'bg-neon-red text-white',
}

const STATUS_LABELS: Record<string, string> = {
  connected: '● LIVE',
  connecting: '◌ Conectando...',
  disconnected: '○ Desconectado',
  error: '✕ Error',
}

export function ConnectionBadge({ state, onReconnect }: Props) {
  const status = state.kline
  return (
    <div className="flex items-center gap-2" style={{ minWidth: '110px' }}>
      <span
        className={`text-xs font-bold tabular-nums ${STATUS_COLORS[status]}`}
        style={{ display: 'inline-block', width: '110px', textAlign: 'center', padding: '2px 6px', borderRadius: '4px' }}
      >
        {STATUS_LABELS[status]}
      </span>
      {(status === 'disconnected' || status === 'error') && (
        <button onClick={onReconnect} className="text-xs text-gray-400 hover:text-white underline whitespace-nowrap">
          Reconectar
        </button>
      )}
    </div>
  )
}
