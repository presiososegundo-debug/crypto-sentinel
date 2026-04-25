/**
 * TradeSetupCard — Fase 3: Visualización Táctica
 * Aparece SOLO cuando score >= 76.
 * Responde: "¿Qué operación abrir?"
 */
import type { AnalysisSignal } from '../types/analysis'

const CONFIDENCE_THRESHOLD = 76

interface Props {
  signal: AnalysisSignal | null
  currentPrice: number
}

function pct(a: number, b: number) {
  return (((b - a) / a) * 100)
}

function rr(entry: number, sl: number, tp: number): string {
  const risk   = Math.abs(entry - sl)
  const reward = Math.abs(tp - entry)
  if (risk === 0) return '—'
  return `1 : ${(reward / risk).toFixed(1)}`
}

function fmt(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function DeltaBadge({ entry, target, direction }: { entry: number; target: number | null; direction: 'long' | 'short' }) {
  if (target === null) return <span className="text-gray-600">—</span>
  const delta = direction === 'long' ? pct(entry, target) : -pct(entry, target)
  const color = delta >= 0 ? 'text-neon-green' : 'text-neon-red'
  return <span className={`text-xs ${color}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(2)}%</span>
}

// ─── Columna de nivel individual ─────────────────────────────────────────────
function LevelRow({
  label, price, delta, riskReward, color, isMain,
}: {
  label: string
  price: number | null
  delta: React.ReactNode
  riskReward?: string
  color: string
  isMain?: boolean
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isMain ? 'ring-1' : ''}`}
      style={isMain ? { backgroundColor: `${color}18`, outline: `1px solid ${color}40` } : { backgroundColor: '#1f293788' }}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs text-gray-300">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-right">
        {delta}
        <span className="font-mono text-sm font-bold text-white">${fmt(price)}</span>
        {riskReward && (
          <span className="text-xs text-gray-500 w-14 text-right">{riskReward}</span>
        )}
      </div>
    </div>
  )
}

export function TradeSetupCard({ signal, currentPrice }: Props) {
  // No renderizar si el score no supera el umbral
  if (!signal || signal.score < CONFIDENCE_THRESHOLD || signal.direction === 'neutral') {
    return null
  }

  const { direction, score, suggestedEntry, suggestedSL, suggestedTP1, suggestedTP2, suggestedTP3, stopHunt, nearestOB } = signal
  const isLong = direction === 'long'
  const accentColor = isLong ? '#00ff88' : '#ff3366'
  const entry = suggestedEntry ?? currentPrice

  // Risk:Reward de cada TP
  const rrTP1 = suggestedSL ? rr(entry, suggestedSL, suggestedTP1 ?? entry) : '—'
  const rrTP2 = suggestedSL ? rr(entry, suggestedSL, suggestedTP2 ?? entry) : '—'
  const rrTP3 = suggestedSL ? rr(entry, suggestedSL, suggestedTP3 ?? entry) : '—'

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: `${accentColor}50`, boxShadow: `0 0 40px ${accentColor}18` }}
    >
      {/* ── Header de dirección ───────────────────────────── */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: `linear-gradient(135deg, ${accentColor}22 0%, #11182700 100%)` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl font-black"
            style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
          >
            {isLong ? '▲' : '▼'}
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Operación detectada</p>
            <p className="text-lg font-bold tracking-wider" style={{ color: accentColor }}>
              {isLong ? 'COMPRAR · LONG' : 'VENDER · SHORT'}
            </p>
          </div>
        </div>

        {/* Score badge */}
        <div className="text-right">
          <div
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
          >
            <span>Score</span>
            <span className="text-base">{score}</span>
            <span className="text-gray-500">/100</span>
          </div>
        </div>
      </div>

      {/* ── Niveles tácticos ──────────────────────────────── */}
      <div className="px-4 pb-4 pt-2 space-y-1.5 bg-dark-card">

        {/* Entrada */}
        <LevelRow
          label="→ Entrada de mercado"
          price={entry}
          delta={<span className="text-xs text-gray-500">precio actual</span>}
          color="#ffffff"
          isMain
        />

        {/* Stop Loss */}
        <LevelRow
          label="✕ Stop Loss Maquiavélico"
          price={suggestedSL}
          delta={<DeltaBadge entry={entry} target={suggestedSL} direction={isLong ? 'short' : 'long'} />}
          color="#ff3366"
          isMain
        />

        {/* Separador */}
        <div className="border-t border-dark-border my-1 pt-1">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-1.5">Objetivos de beneficio (Fibonacci)</p>
        </div>

        {/* TP1 */}
        <LevelRow
          label="TP1 · Fibo 0.618"
          price={suggestedTP1}
          delta={<DeltaBadge entry={entry} target={suggestedTP1} direction={direction} />}
          riskReward={rrTP1}
          color="#86efac"
        />

        {/* TP2 */}
        <LevelRow
          label="TP2 · Fibo 1.0"
          price={suggestedTP2}
          delta={<DeltaBadge entry={entry} target={suggestedTP2} direction={direction} />}
          riskReward={rrTP2}
          color="#4ade80"
        />

        {/* TP3 — objetivo principal */}
        <LevelRow
          label="🎯 TP3 · Fibo 1.618"
          price={suggestedTP3}
          delta={<DeltaBadge entry={entry} target={suggestedTP3} direction={direction} />}
          riskReward={rrTP3}
          color={accentColor}
          isMain
        />
      </div>

      {/* ── Razón de la señal ─────────────────────────────── */}
      <div className="px-4 py-3 bg-dark-bg/60 space-y-1.5 border-t border-dark-border">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Por qué esta entrada</p>
        <div className="flex flex-wrap gap-1.5">
          {stopHunt && (
            <span className="px-2 py-0.5 rounded text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40">
              ⚡ Stop Hunt {stopHunt.direction === 'bullish' ? '↑' : '↓'} detectado
            </span>
          )}
          {nearestOB && (
            <span className="px-2 py-0.5 rounded text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40">
              📦 OB {nearestOB.type} a {nearestOB.distancePct.toFixed(1)}%
              {!nearestOB.tested ? ' ★ fresco' : ''}
            </span>
          )}
          {signal.scoreBreakdown.fundingScore > 0 && (
            <span className="px-2 py-0.5 rounded text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
              💸 Funding desequilibrado
            </span>
          )}
        </div>

        {/* Advertencia de gestión */}
        <p className="text-xs text-gray-600 pt-1">
          ⚠️ Coloca el SL justo debajo del barrido — no del precio actual.
          Escala en TP1 y deja correr hasta TP3.
        </p>
      </div>
    </div>
  )
}
