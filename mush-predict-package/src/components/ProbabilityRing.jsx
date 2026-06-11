export default function ProbabilityRing({ value, size = 64, label, sublabel }) {
  const stroke    = 5
  const radius    = (size - stroke) / 2
  const circ      = 2 * Math.PI * radius
  const offset    = circ - value * circ
  const tier      = value > 0.6 ? 'high' : value > 0.35 ? 'medium' : 'low'
  const colorMap  = { high: '#C15A2D', medium: '#D7944B', low: '#447D29' }
  const color     = colorMap[tier]

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} strokeWidth={stroke} fill="none" className="ring-bg" />
          <circle
            cx={size/2} cy={size/2} r={radius}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-barlow font-bold text-white text-base leading-none">{Math.round(value * 100)}<span className="text-[10px] text-white/40">%</span></div>
        </div>
      </div>
      {label    && <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-1.5">{label}</div>}
      {sublabel && <div className="text-[11px] font-barlow text-white/60">{sublabel}</div>}
    </div>
  )
}
