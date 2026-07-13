import { useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'

export interface PublishViewProps {
  project: MapProjectSummary
  onBack: () => void
}

const SPRINGFILES_UPLOAD_URL = 'https://springfiles.springrts.com/upload/'
const ZK_MAPS_URL = 'https://zero-k.info/Maps'

interface CompileState {
  status: 'idle' | 'compiling' | 'done' | 'error'
  sd7Path?: string
  error?: string
}

export function PublishView({ project, onBack }: PublishViewProps): JSX.Element {
  const [state, setState] = useState<CompileState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  async function handleCompile(): Promise<void> {
    setState({ status: 'compiling' })
    try {
      const result = await window.api.compileProject(project.projectPath)
      setState({ status: 'done', sd7Path: result.sd7Path })
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleCopyMetadata(): Promise<void> {
    const text = `Name: ${project.name}\nAutor: ${project.author}\nVersion: ${project.version}\nBeschreibung: ${project.description}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Veröffentlichen</h1>
        <p className="subtitle">{project.name} · Upload auf springfiles/zero-k.info</p>
      </header>
      <main className="mapinfo-form">
        <p className="hint">
          Es gibt keine öffentliche Upload-API für springfiles.springrts.com oder zero-k.info —
          der Community-Prozess ist manuell: Datei bei springfiles hochladen, dort wird sie
          "unitsynced" (indexiert) und danach über die Spring-Infrastruktur bzw. zero-k.info/Maps
          auffindbar. Diese Ansicht bereitet die Datei vor und öffnet die nötigen Seiten.
        </p>

        {state.status === 'error' && <p className="error">{state.error}</p>}

        {state.status !== 'done' && (
          <button onClick={handleCompile} disabled={state.status === 'compiling'}>
            {state.status === 'compiling' ? 'Kompiliert…' : '1. Karte kompilieren'}
          </button>
        )}

        {state.status === 'done' && (
          <div className="compile-result">
            <p>✓ Bereit zum Veröffentlichen:</p>
            <p className="project-path">{state.sd7Path}</p>

            <div className="project-actions">
              <button onClick={() => window.api.showInFolder(state.sd7Path as string)}>
                2. Ordner mit der Datei öffnen
              </button>
              <button onClick={() => window.api.openExternal(SPRINGFILES_UPLOAD_URL)}>
                3. Springfiles-Upload öffnen
              </button>
              <button onClick={() => window.api.openExternal(ZK_MAPS_URL)}>
                4. Zero-K Maps-Seite öffnen
              </button>
            </div>

            <label className="form-field">
              Metadaten für das Upload-Formular
              <textarea
                readOnly
                rows={4}
                value={`Name: ${project.name}\nAutor: ${project.author}\nVersion: ${project.version}\nBeschreibung: ${project.description}`}
              />
            </label>
            <button onClick={handleCopyMetadata}>
              {copied ? 'Kopiert ✓' : 'Metadaten in Zwischenablage kopieren'}
            </button>

            <p className="hint">
              Nach dem Upload kann die Indexierung eine Weile dauern, bevor die Karte über
              zero-k.info/Maps auffindbar ist. Für "Featured"-Status ist zusätzlich eine
              Community-/Admin-Freigabe üblich.
            </p>
          </div>
        )}

        <div className="dialog-actions">
          <button onClick={onBack}>← Zurück</button>
        </div>
      </main>
    </div>
  )
}
