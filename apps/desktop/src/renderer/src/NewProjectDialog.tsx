import { useEffect, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'

interface NewProjectDialogProps {
  onClose: () => void
  onCreated: (project: MapProjectSummary) => void
}

// Zero-K/Spring requires the map's width/height in squares to be divisible by 128, and one
// "NxN" size unit here is 64 squares — so N itself must be even (N*64 % 128 === 0 <=> N even).
function isValidSize(n: number): boolean {
  return Number.isInteger(n) && n >= 2 && n % 2 === 0
}

// There's no reliably documented hard maximum for Zero-K/Spring itself — old forum posts cite
// wildly different numbers (16x16 to 58x58) that are contradicted by existing official maps
// larger than that. This threshold is only a soft warning about OUR OWN compiler (Milestone 6),
// whose diffuse-texture generation scales quadratically with map size and hasn't been tested
// against anything this large — not a claim about what Zero-K itself supports.
const LARGE_SIZE_WARNING_THRESHOLD = 20

export function NewProjectDialog({ onClose, onCreated }: NewProjectDialogProps): JSX.Element {
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')
  const [width, setWidth] = useState(8)
  const [height, setHeight] = useState(8)
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Vorbelegung mit dem OS-spezifischen Standardpfad (z.B. %APPDATA%\Zero-K Map Creator\Projects),
  // manuelle Auswahl über "Wählen…" bleibt weiterhin möglich.
  useEffect(() => {
    window.api.getDefaultProjectsDir().then(setParentDir)
  }, [])

  async function handleChooseFolder(): Promise<void> {
    const dir = await window.api.pickParentDir()
    if (dir) setParentDir(dir)
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!parentDir) {
      setError('Bitte zuerst einen Speicherort wählen.')
      return
    }
    if (!name.trim()) {
      setError('Bitte einen Projektnamen eingeben.')
      return
    }
    if (!isValidSize(width) || !isValidSize(height)) {
      setError('Breite und Höhe müssen gerade Zahlen ≥ 2 sein (Zero-K-Anforderung, siehe Hinweis).')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const project = await window.api.createProject({
        parentDir,
        name,
        author,
        description,
        size: { width, height }
      })
      onCreated(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <form className="dialog" onSubmit={handleSubmit}>
        <h2>Neues Projekt</h2>

        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <label>
          Autor
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>

        <label>
          Beschreibung
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="size-row">
          <label>
            Breite (z.B. 8 für "8x8")
            <input
              type="number"
              min={2}
              step={2}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label>
            Höhe (z.B. 8 für "8x8")
            <input
              type="number"
              min={2}
              step={2}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </label>
        </div>
        <p className="hint">
          Zero-K-Größenangabe: 1 Einheit = 64 Squares (8 → 512×512 Squares). Muss jeweils eine
          gerade Zahl sein, sonst lehnt Spring die Karte beim Kompilieren ab.
        </p>
        {(width > LARGE_SIZE_WARNING_THRESHOLD || height > LARGE_SIZE_WARNING_THRESHOLD) && (
          <p className="hint warning">
            Große Karten wurden mit unserem Compiler noch nicht getestet — die
            Textur-Generierung wird mit der Fläche quadratisch langsamer und könnte sehr lange
            dauern oder hängen bleiben. (Das ist keine Aussage über Zero-Ks eigenes Limit, das
            konnte ich nicht verlässlich klären.)
          </p>
        )}

        <label>
          Speicherort
          <div className="folder-row">
            <span>{parentDir ?? 'Kein Ordner gewählt'}</span>
            <button type="button" onClick={handleChooseFolder}>
              Wählen…
            </button>
          </div>
        </label>

        {error && <p className="error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" disabled={creating}>
            {creating ? 'Wird erstellt…' : 'Erstellen'}
          </button>
        </div>
      </form>
    </div>
  )
}
