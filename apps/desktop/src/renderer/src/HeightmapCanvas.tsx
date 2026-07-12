import { useEffect, useRef } from 'react'

export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten'

export interface HeightmapCanvasProps {
  heightsRef: React.MutableRefObject<Float32Array>
  width: number
  height: number
  brushMode: BrushMode
  brushRadius: number
  brushStrength: number
  onChange: () => void
}

/** Renders the heightmap as a grayscale image and applies brush strokes on drag. */
export function HeightmapCanvas({
  heightsRef,
  width,
  height,
  brushMode,
  brushRadius,
  brushStrength,
  onChange
}: HeightmapCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paintingRef = useRef(false)
  const flattenTargetRef = useRef(0.5)
  const rafPendingRef = useRef(false)

  function redraw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const heights = heightsRef.current
    const image = ctx.createImageData(width, height)
    for (let i = 0; i < heights.length; i++) {
      const v = Math.max(0, Math.min(1, heights[i]))
      const gray = Math.round(v * 255)
      image.data[i * 4] = gray
      image.data[i * 4 + 1] = gray
      image.data[i * 4 + 2] = gray
      image.data[i * 4 + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  }

  // Redraw whenever a freshly loaded heightmap (a new array reference) arrives.
  useEffect(redraw, [heightsRef.current, width, height])

  function scheduleRedraw(): void {
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    requestAnimationFrame(() => {
      redraw()
      onChange()
      rafPendingRef.current = false
    })
  }

  function eventToGridCoords(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * height)
    return { x, y }
  }

  function applyBrush(centerX: number, centerY: number): void {
    const heights = heightsRef.current
    const radius = brushRadius
    const minX = Math.max(0, Math.floor(centerX - radius))
    const maxX = Math.min(width - 1, Math.ceil(centerX + radius))
    const minY = Math.max(0, Math.floor(centerY - radius))
    const maxY = Math.min(height - 1, Math.ceil(centerY + radius))

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - centerX, y - centerY)
        if (dist > radius) continue
        const falloff = 1 - dist / radius // linear falloff, 1 at center to 0 at edge
        const index = y * width + x
        const current = heights[index]

        let next = current
        switch (brushMode) {
          case 'raise':
            next = current + brushStrength * falloff
            break
          case 'lower':
            next = current - brushStrength * falloff
            break
          case 'smooth': {
            const left = heights[index - 1] ?? current
            const right = heights[index + 1] ?? current
            const up = heights[index - width] ?? current
            const down = heights[index + width] ?? current
            const avg = (left + right + up + down) / 4
            next = current + (avg - current) * falloff * brushStrength * 4
            break
          }
          case 'flatten':
            next = current + (flattenTargetRef.current - current) * falloff * brushStrength * 4
            break
        }
        heights[index] = Math.max(0, Math.min(1, next))
      }
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    paintingRef.current = true
    const { x, y } = eventToGridCoords(e)
    if (brushMode === 'flatten') {
      const index = Math.max(0, Math.min(heightsRef.current.length - 1, y * width + x))
      flattenTargetRef.current = heightsRef.current[index]
    }
    applyBrush(x, y)
    scheduleRedraw()
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!paintingRef.current) return
    const { x, y } = eventToGridCoords(e)
    applyBrush(x, y)
    scheduleRedraw()
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    paintingRef.current = false
    ;(e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId)
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="heightmap-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  )
}
