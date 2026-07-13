import { useEffect, useRef, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { mapWorldSize } from '@zk-map/shared-types'
import type { Point2D, StartboxConfig } from '@zk-map/map-lua'

export interface StartboxEditorProps {
  project: MapProjectSummary
  onBack: () => void
}

const DISPLAY_SIZE = 640
const TEAM_COLORS = ['#4d7cff', '#ff5c5c']

interface DragTarget {
  team: number
  kind: 'corner' | 'start'
  index: number
}

export function StartboxEditor({ project, onBack }: StartboxEditorProps): JSX.Element {
  const worldWidth = mapWorldSize(project.size.width)
  const worldHeight = mapWorldSize(project.size.height)

  const [config, setConfig] = useState<StartboxConfig | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const dragRef = useRef<DragTarget | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let cancelled = false
    window.api.loadStartboxes(project.projectPath, worldWidth, worldHeight).then((loaded) => {
      if (!cancelled) setConfig(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [project.projectPath, worldWidth, worldHeight])

  async function handleSave(): Promise<void> {
    if (!config) return
    setSaveState('saving')
    await window.api.saveStartboxes(project.projectPath, config)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  function worldToScreen([x, z]: Point2D): [number, number] {
    return [(x / worldWidth) * DISPLAY_SIZE, (z / worldHeight) * DISPLAY_SIZE]
  }

  function screenToWorld(sx: number, sy: number): Point2D {
    return [
      Math.max(0, Math.min(worldWidth, (sx / DISPLAY_SIZE) * worldWidth)),
      Math.max(0, Math.min(worldHeight, (sy / DISPLAY_SIZE) * worldHeight))
    ]
  }

  function handleHandleDown(team: number, kind: 'corner' | 'start', index: number) {
    return (e: React.PointerEvent<SVGCircleElement>): void => {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      dragRef.current = { team, kind, index }
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const drag = dragRef.current
    if (!drag || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const worldPt = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    setConfig((prev) => {
      if (!prev) return prev
      const teams = prev.teams.map((team, ti) => {
        if (ti !== drag.team) return team
        if (drag.kind === 'start') {
          const startpoints = team.startpoints.slice()
          startpoints[drag.index] = worldPt
          return { ...team, startpoints }
        }
        const boxes = team.boxes.map((box, bi) =>
          bi === 0 ? box.map((p, pi) => (pi === drag.index ? worldPt : p)) : box
        )
        return { ...team, boxes }
      })
      return { ...prev, teams }
    })
  }

  function handlePointerUp(): void {
    dragRef.current = null
  }

  function renameTeam(index: number, name: string): void {
    setConfig((prev) => {
      if (!prev) return prev
      const teams = prev.teams.map((team, ti) =>
        ti === index ? { ...team, nameLong: name, nameShort: name.slice(0, 8) || `T${ti + 1}` } : team
      )
      return { ...prev, teams }
    })
  }

  return (
    <div className="terrain-editor">
      <div className="terrain-toolbar">
        <button onClick={onBack}>← Zurück</button>
        <p className="toolbar-hint">Ecken und Startpunkte ziehen, um die Startboxen anzupassen.</p>
        <button onClick={handleSave} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Speichert…' : saveState === 'saved' ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      {!config ? (
        <p className="loading">Lade…</p>
      ) : (
        <div className="startbox-pane">
          <svg
            ref={svgRef}
            width={DISPLAY_SIZE}
            height={DISPLAY_SIZE}
            className="startbox-svg"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <rect x={0} y={0} width={DISPLAY_SIZE} height={DISPLAY_SIZE} className="map-bounds" />
            {config.teams.map((team, ti) => {
              const color = TEAM_COLORS[ti % TEAM_COLORS.length]
              const box = team.boxes[0] ?? []
              const screenPoints = box.map(worldToScreen)
              return (
                <g key={ti}>
                  <polygon
                    points={screenPoints.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill={color}
                    fillOpacity={0.25}
                    stroke={color}
                    strokeWidth={2}
                  />
                  {screenPoints.map(([x, y], pi) => (
                    <circle
                      key={pi}
                      cx={x}
                      cy={y}
                      r={7}
                      className="handle"
                      style={{ fill: color }}
                      onPointerDown={handleHandleDown(ti, 'corner', pi)}
                    />
                  ))}
                  {team.startpoints.map((sp, si) => {
                    const [x, y] = worldToScreen(sp)
                    return (
                      <circle
                        key={si}
                        cx={x}
                        cy={y}
                        r={9}
                        className="handle start-handle"
                        style={{ fill: '#fff', stroke: color, strokeWidth: 3 }}
                        onPointerDown={handleHandleDown(ti, 'start', si)}
                      />
                    )
                  })}
                </g>
              )
            })}
          </svg>

          <div className="startbox-legend">
            {config.teams.map((team, ti) => (
              <label key={ti} className="legend-row">
                <span className="legend-swatch" style={{ background: TEAM_COLORS[ti % TEAM_COLORS.length] }} />
                <input value={team.nameLong} onChange={(e) => renameTeam(ti, e.target.value)} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
