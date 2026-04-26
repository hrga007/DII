// Hrvatska zastava s animiranim vijoranjem (SVG feTurbulence + feDisplacementMap)
// Vijori se kao da puše vjetar s lijeve strane

interface Props {
  className?: string
  opacity?: number
}

// Šahovnica: 5×5, prva kocka je crvena
const CELL_W = 22.4
const CELL_H = 22
const GRID_X = 244
const GRID_Y = 98

function Sahovnica() {
  const cells = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const isRed = (row + col) % 2 === 0
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={GRID_X + col * CELL_W}
          y={GRID_Y + row * CELL_H}
          width={CELL_W}
          height={CELL_H}
          fill={isRed ? '#D4000D' : '#FFFFFF'}
        />
      )
    }
  }
  return <>{cells}</>
}

// Kruna — 5 povijesnih štitova iznad glavnog grba
const CROWN_SHIELDS = [
  // 1. Hrvatska: plavi štit s crveno-bijelim prugama
  { x: 240, fill: '#003DA5', stripes: true },
  // 2. Dubrovačka Republika: plavi štit sa zlatnim likom
  { x: 264, fill: '#003DA5', star: true },
  // 3. Dalmacija: plavi štit s krunicama
  { x: 288, fill: '#0066CC', crowns: true },
  // 4. Istra: plavi štit s kozom
  { x: 312, fill: '#003DA5', goat: true },
  // 5. Slavonija: plavi štit sa zvijezdom
  { x: 336, fill: '#003DA5', star2: true },
]

function CrownShield({ cfg }: { cfg: typeof CROWN_SHIELDS[0] }) {
  const { x } = cfg
  const w = 22
  const yTop = 58
  const yMid = 73
  const yBot = 98
  // Pentagon pointing up
  const path = `M ${x + w / 2},${yTop} L ${x + w},${yMid} L ${x + w},${yBot} L ${x},${yBot} L ${x},${yMid} Z`
  return (
    <g>
      <path d={path} fill={cfg.fill} stroke="#FFFFFF" strokeWidth="1" />
      {/* Simplified decoration inside each shield */}
      {cfg.stripes && (
        <>
          <rect x={x + 2} y={yMid + 2} width={w - 4} height={3} fill="#D4000D" opacity="0.9" />
          <rect x={x + 2} y={yMid + 7} width={w - 4} height={3} fill="#D4000D" opacity="0.9" />
          <rect x={x + 2} y={yMid + 12} width={w - 4} height={3} fill="#D4000D" opacity="0.9" />
        </>
      )}
      {cfg.star && (
        <text x={x + w / 2} y={yMid + 14} textAnchor="middle" fontSize="11" fill="#FFD700">★</text>
      )}
      {cfg.crowns && (
        <text x={x + w / 2} y={yMid + 14} textAnchor="middle" fontSize="9" fill="#FFD700">♛</text>
      )}
      {cfg.goat && (
        <text x={x + w / 2} y={yMid + 13} textAnchor="middle" fontSize="9" fill="#FFD700">🐐</text>
      )}
      {cfg.star2 && (
        <text x={x + w / 2} y={yMid + 14} textAnchor="middle" fontSize="11" fill="#FFD700">✦</text>
      )}
    </g>
  )
}

export function WavingFlag({ className = '', opacity = 1 }: Props) {
  const shieldPath = 'M 244,98 L 356,98 L 356,196 Q 300,238 244,196 Z'
  const shieldStrokePath = 'M 244,98 L 356,98 L 356,196 Q 300,238 244,196 Z'

  return (
    <svg
      viewBox="0 0 600 300"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* Animirani val — simulacija tkanine koja se vijori na vjetru */}
        <filter id="cloth-wave" x="-5%" y="-5%" width="115%" height="115%" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.025"
            numOctaves="4"
            seed="3"
            result="turbulence"
          >
            <animate
              attributeName="baseFrequency"
              values="0.018 0.025; 0.028 0.038; 0.020 0.030; 0.015 0.022; 0.018 0.025"
              dur="3.2s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          {/* Gradijentna maska: lijeva strana (jarbol) se manje giba */}
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 8 -1"
            in="turbulence"
            result="maskedTurbulence"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="turbulence"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Clip za šahovnicu unutar štita */}
        <clipPath id="shield-clip">
          <path d={shieldPath} />
        </clipPath>

        {/* Vertikalni gradijent za sjenu vijorenja */}
        <linearGradient id="shadow-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.08" />
          <stop offset="50%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      {/* ── Cijela zastava s efektom vijorenja ── */}
      <g filter="url(#cloth-wave)">
        {/* Pruge */}
        <rect x="0" y="0" width="600" height="100" fill="#D4000D" />
        <rect x="0" y="100" width="600" height="100" fill="#FFFFFF" />
        <rect x="0" y="200" width="600" height="100" fill="#0032A0" />

        {/* Sjena vijorenja */}
        <rect x="0" y="0" width="600" height="300" fill="url(#shadow-grad)" />

        {/* ── Grb (Coat of Arms) ── */}
        {/* Pozadina štita (bijela) */}
        <path d={shieldPath} fill="#FFFFFF" />

        {/* Šahovnica clippana na oblik štita */}
        <g clipPath="url(#shield-clip)">
          <Sahovnica />
        </g>

        {/* Obrub štita */}
        <path d={shieldStrokePath} fill="none" stroke="#D4000D" strokeWidth="2.5" />

        {/* Kruna — 5 povijesnih štitova */}
        {CROWN_SHIELDS.map((cfg, i) => (
          <CrownShield key={i} cfg={cfg} />
        ))}

        {/* Vodoravna crta između krune i glavnog štita */}
        <rect x="240" y="97" width="120" height="2" fill="#D4000D" />
      </g>
    </svg>
  )
}
