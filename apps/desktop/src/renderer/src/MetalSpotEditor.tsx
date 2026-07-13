import { useEffect, useRef, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { mapWorldSize } from '@zk-map/shared-types'
import type { MetalLayout } from '@zk-map/map-lua'

export interface MetalSpotEditorProps {
  project: MapProjectSummary
  onBack: () => void
}

const DISPLAY_SIZE = 640
const DEFAULT_METAL_YIELD = 2

export function MetalSpotEditor({ project, onBack }: MetalSpotEditorProps): JSX.Element {
  const worldWidth = mapWorldSize(project.size.width)
  const worldHeight = mapWorldSize(project.size.height)

  const [layout, setLayout] = useState<MetalLayout | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const draggingRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let cancelled = false
    window.api.loadMetalLayout(project.projectPath).then((loaded) => {
      if (!cancelled) setLayout(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [project.projectPath])

  async function handleSave(): Promise<void> {
    if (!layout) return
    setSaveState('saving')
    await window.api.saveMetalLayout(project.projectPath, layout)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  function worldToScreen(x: number, z: number): [number, number] {
    return [(x / worldWidth) * DISPLAY_SIZE, (z / worldHeight) * DISPLAY_SIZE]
  }

  function screenToWorld(sx: number, sy: number): [number, number] {
    return [
      Math.max(0, Math.min(worldWidth, (sx / DISPLAY_SIZE) * worldWidth)),
      Math.max(0, Math.min(worldHeight, (sy / DISPLAY_SIZE) * worldHeight))
    ]
  }

  function handleBackgroundClick(e: React.MouseEvent<SVGSVGElement>): void {
    if (!svgRef.current || !layout) return
    const rect = svgRef.current.getBoundingClientRect()
    const [x, z] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const newIndex = layout.spots.length
    setLayout({ spots: [...layout.spots, { x, z, metal: DEFAULT_METAL_YIELD }] })
    setSelected(newIndex)
  }

  function handleSpotDown(index: number) {
    return (e: React.PointerEvent<SVGCircleElement>): void => {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      draggingRef.current = index
      setSelected(index)
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const index = draggingRef.current
    if (index === null || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const [x, z] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    setLayout((prev) => {
      if (!prev) return prev
      const spots = prev.spots.map((s, i) => (i === index ? { ...s, x, z } : s))
      return { spots }
    })
  }

  function handlePointerUp(): void {
    draggingRef.current = null
  }

  function updateSelectedMetal(value: number): void {
    if (selected === null) return
    setLayout((prev) => {
      if (!prev) return prev
      const spots = prev.spots.map((s, i) => (i === selected ? { ...s, metal: value } : s))
      return { spots }
    })
  }

  function deleteSelected(): void {
    if (selected === null) return
    setLayout((prev) => {
      if (!prev) return prev
      return { spots: prev.spots.filter((_, i) => i !== selected) }
    })
    setSelected(null)
  }

  return (
    <div className="terrain-editor">
      <div className="terrain-toolbar">
        <button onClick={onBack}>← Zurück</button>
        <p className="toolbar-hint">Klick = Spot hinzufügen · Ziehen = verschieben</p>
        <button onClick={handleSave} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Speichert…' : saveState === 'saved' ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      {!layout ? (
        <p className="loading">Lade…</p>
      ) : (
        <div className="startbox-pane">
          <svg
            ref={svgRef}
            width={DISPLAY_SIZE}
            height={DISPLAY_SIZE}
            className="startbox-svg"
            onClick={handleBackgroundClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <rect x={0} y={0} width={DISPLAY_SIZE} height={DISPLAY_SIZE} className="map-bounds" />
            {layout.spots.map((spot, i) => {
              const [x, y] = worldToScreen(spot.x, spot.z)
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={10}
                  className={`handle metal-spot${selected === i ? ' selected' : ''}`}
                  onPointerDown={handleSpotDown(i)}
                />
              )
            })}
          </svg>

          <div className="metal-side-panel">
            {selected === null || !layout.spots[selected] ? (
              <p className="hint">Kein Metal-Spot ausgewählt.</p>
            ) : (
              <>
                <label className="form-field">
                  Metallertrag
                  <input
                    type="number"
                    step={0.5}
                    value={layout.spots[selected].metal ?? DEFAULT_METAL_YIELD}
                    onChange={(e) => updateSelectedMetal(Number(e.target.value))}
                  />
                </label>
                <button onClick={deleteSelected}>Spot löschen</button>
              </>
            )}
            <p className="hint">{layout.spots.length} Spot(s) insgesamt</p>
          </div>
        </div>
      )}
    </div>
  )
}
