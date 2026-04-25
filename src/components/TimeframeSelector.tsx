import type { Timeframe } from '../hooks/useBinanceWS'

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m',  label: '1m'  },
  { value: '5m',  label: '5m'  },
  { value: '15m', label: '15m' },
  { value: '1h',  label: '1h'  },
  { value: '4h',  label: '4h'  },
  { value: '1d',  label: '1D'  },
]

interface Props {
  value: Timeframe
  onChange: (tf: Timeframe) => void
}

export function TimeframeSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 bg-dark-card border border-dark-border rounded-lg p-0.5">
      {TIMEFRAMES.map(tf => (
        <button
          key={tf.value}
          onClick={() => onChange(tf.value)}
          className={`px-2.5 py-1 rounded text-xs font-bold transition-all duration-150 ${
            value === tf.value
              ? 'bg-neon-green text-black shadow-[0_0_8px_#00ff8860]'
              : 'text-gray-500 hover:text-gray-200 hover:bg-dark-border'
          }`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  )
}
