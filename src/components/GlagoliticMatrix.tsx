// Matrix efekt s glagoljičnim znakovima u crvenoj boji
// Glagoljiča: Unicode blok U+2C00–U+2C2E

import { useEffect, useRef } from 'react'

const CHARS = Array.from({ length: 47 }, (_, i) => String.fromCodePoint(0x2C00 + i))

export function GlagoliticMatrix({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Capture as non-null after checks — closures below are safe
    const cvs = canvas as HTMLCanvasElement
    const c2d = ctx as CanvasRenderingContext2D

    const SIZE = 18        // veličina fonta i širina stupca
    const SPEED_MS = 48    // ~21fps
    let drops: number[] = []
    let raf: number
    let last = 0

    function setup() {
      const w = cvs.offsetWidth
      const h = cvs.offsetHeight
      if (w === 0 || h === 0) return
      cvs.width = w
      cvs.height = h
      const cols = Math.ceil(w / SIZE)
      drops = Array.from({ length: cols }, () =>
        Math.floor(Math.random() * -(h / SIZE) * 1.5)
      )
      c2d.fillStyle = '#000'
      c2d.fillRect(0, 0, w, h)
    }

    setup()
    const ro = new ResizeObserver(setup)
    ro.observe(cvs)

    function draw(now: number) {
      raf = requestAnimationFrame(draw)
      if (now - last < SPEED_MS) return
      last = now

      const W = cvs.width
      const H = cvs.height

      // Blijedi trag — manji alpha = duži trag
      c2d.fillStyle = 'rgba(0, 0, 0, 0.045)'
      c2d.fillRect(0, 0, W, H)

      c2d.font = `bold ${SIZE}px "Segoe UI Historic", "Noto Sans Glagolitic", serif`

      const cols = Math.ceil(W / SIZE)
      for (let col = 0; col < cols && col < drops.length; col++) {
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)]
        const x = col * SIZE
        const y = drops[col] * SIZE

        // Tijelo slova — tamnocrvena
        c2d.fillStyle = '#BB0000'
        c2d.fillText(ch, x, y)

        // Glava — sjajan bijelo-crveni sjaj na vrhu svakog stupca
        c2d.fillStyle = 'rgba(255, 100, 100, 0.75)'
        c2d.fillText(ch, x, y)

        // Resetiraj stupac kad prođe dno
        if (y > H && Math.random() > 0.975) {
          drops[col] = 0
        }
        drops[col]++
      }
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className={className} />
}
