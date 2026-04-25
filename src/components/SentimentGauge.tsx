/**
 * SentimentGauge — Medidor visual tipo velocímetro (SVG puro)
 * 1-40: Rojo  | 41-75: Amarillo  | 76-100: Verde Neón
 */

interface Props {
  score: number   // 1-100
  animated?: boolean
}

// Convierte score (1-100) a ángulo del arco (0° = izquierda, 180° = derecha)
function scoreToAngle(score: number): number {
  return ((score - 1) / 99) * 180
}

// Convierte coordenadas polares a cartesianas (centro = 110, 110, radio = 90)
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Genera el path de un arco SVG
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

const CX = 110
const CY = 110
const RADIUS = 88
const NEEDLE_LENGTH = 78

function getColor(score: number): string {
  if (score >= 76) return '#00ff88'   // neon-green
  if (score >= 41) return '#ffcc00'   // neon-yellow
  return '#ff3366'                     // neon-red
}

function getZoneLabel(score: number): { label: string; sub: string } {
  if (score >= 76) return { label: 'ALTA CONFLUENCIA', sub: 'Smart Money activo' }
  if (score >= 41) return { label: 'ESPERAR', sub: 'Confirmación pendiente' }
  return { label: 'NO OPERAR', sub: 'Riesgo de trampa' }
}

export function SentimentGauge({ score, animated = true }: Props) {
  const clampedScore = Math.max(1, Math.min(100, score))
  const angle = scoreToAngle(clampedScore)
  const color = getColor(clampedScore)
  const { label, sub } = getZoneLabel(clampedScore)

  // Needle tip position
  const tip = polarToCartesian(CX, CY, NEEDLE_LENGTH, angle)
  const base1 = polarToCartesian(CX, CY, 12, angle + 90)
  const base2 = polarToCartesian(CX, CY, 12, angle - 90)

  // Arcos de color (3 zonas)
  const redArc = arcPath(CX, CY, RADIUS, 0, 72)          // 0-40% del arco
  const yellowArc = arcPath(CX, CY, RADIUS, 72, 135)     // 40-75%
  const greenArc = arcPath(CX, CY, RADIUS, 135, 180)     // 75-100%

  // Marcadores de tick
  const ticks = [0, 20, 40, 60, 80, 100].map(v => {
    const ang = scoreToAngle(v)
    const inner = polarToCartesian(CX, CY, RADIUS - 10, ang)
    const outer = polarToCartesian(CX, CY, RADIUS + 4, ang)
    const label = polarToCartesian(CX, CY, RADIUS - 22, ang)
    return { v, inner, outer, label }
  })

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        width={220}
        height={130}
        viewBox="0 0 220 130"
        className="overflow-visible"
        aria-label={`Medidor de confluencia: ${clampedScore}/100`}
      >
        {/* Fondo del medidor */}
        <path
          d={arcPath(CX, CY, RADIUS, 0, 180)}
          fill="none"
          stroke="#1f2937"
          strokeWidth={18}
          strokeLinecap="round"
        />

        {/* Zona roja */}
        <path d={redArc} fill="none" stroke="#ff3366" strokeWidth={16} opacity={0.35} strokeLinecap="butt" />
        {/* Zona amarilla */}
        <path d={yellowArc} fill="none" stroke="#ffcc00" strokeWidth={16} opacity={0.35} strokeLinecap="butt" />
        {/* Zona verde */}
        <path d={greenArc} fill="none" stroke="#00ff88" strokeWidth={16} opacity={0.35} strokeLinecap="round" />

        {/* Arco de progreso activo */}
        <path
          d={arcPath(CX, CY, RADIUS, 0, angle)}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          style={animated ? { transition: 'all 0.6s ease' } : undefined}
          filter="url(#glow)"
        />

        {/* Glow filter */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Tick marks */}
        {ticks.map(t => (
          <g key={t.v}>
            <line
              x1={t.inner.x} y1={t.inner.y}
              x2={t.outer.x} y2={t.outer.y}
              stroke="#4b5563" strokeWidth={1.5}
            />
            <text
              x={t.label.x} y={t.label.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill="#6b7280"
            >
              {t.v}
            </text>
          </g>
        ))}

        {/* Aguja */}
        <polygon
          points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
          fill={color}
          opacity={0.9}
          filter="url(#glow)"
          style={animated ? { transition: 'all 0.6s ease' } : undefined}
        />

        {/* Centro de la aguja */}
        <circle cx={CX} cy={CY} r={7} fill="#111827" stroke={color} strokeWidth={2} />
        <circle cx={CX} cy={CY} r={3} fill={color} />

        {/* Score numérico */}
        <text
          x={CX} y={CY + 26}
          textAnchor="middle"
          fontSize={22}
          fontWeight="bold"
          fill={color}
          fontFamily="monospace"
          style={animated ? { transition: 'fill 0.6s ease' } : undefined}
        >
          {clampedScore}
        </text>
        <text x={CX} y={CY + 38} textAnchor="middle" fontSize={7} fill="#6b7280">
          / 100
        </text>
      </svg>

      {/* Etiqueta de zona */}
      <div className="mt-1 text-center">
        <p
          className="text-sm font-bold tracking-wider transition-colors duration-500"
          style={{ color }}
        >
          {label}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}
