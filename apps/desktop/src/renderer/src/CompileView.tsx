import { useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'

export interface CompileViewProps {
  project: MapProjectSummary
  onBack: () => void
}

interface CompileState {
  status: 'idle' | 'compiling' | 'done' | 'error'
  sddPath?: string
  sd7Path?: string
  warnings?: string[]
  durationMs?: number
  error?: string
}

export function CompileView({ project, onBack }: CompileViewProps): JSX.Element {
  const [state, setState] = useState<CompileState>({ status: 'idle' })

  async function handleCompile(): Promise<void> {
    setState({ status: 'compiling' })
    try {
      const result = await window.api.compileProject(project.projectPath)
      setState({ status: 'done', ...result })
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kompilieren</h1>
        <p className="subtitle">
          {project.name} · erzeugt eine spielbare .sdd/.sd7 aus den aktuellen Projektdaten
        </p>
      </header>
      <main className="mapinfo-form">
        <p className="hint">
          Fasst Terrain, Kartendaten, Startboxen, Metal-Spots und Features zu einer echten Zero-K-Karte
          zusammen. Da es noch keinen Textur-Pinsel gibt, wird die Bodentextur automatisch aus der
          Heightmap erzeugt (Höhen- und Hangschattierung).
        </p>

        {state.status === 'error' && <p className="error">{state.error}</p>}

        {state.status === 'done' && (
          <div className="compile-result">
            <p>✓ Kompiliert in {((state.durationMs ?? 0) / 1000).toFixed(1)}s</p>
            <p className="project-path">{state.sd7Path}</p>
            {state.warnings && state.warnings.length > 0 && (
              <ul className="hint warning">
                {state.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <button onClick={() => window.api.showInFolder(state.sd7Path as string)}>
              Ordner öffnen
            </button>
          </div>
        )}

        <div className="dialog-actions">
          <button onClick={onBack}>← Zurück</button>
          <button onClick={handleCompile} disabled={state.status === 'compiling'}>
            {state.status === 'compiling' ? 'Kompiliert…' : 'Kompilieren'}
          </button>
        </div>
      </main>
    </div>
  )
}
