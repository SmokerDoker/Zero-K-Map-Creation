import { useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'

interface NewProjectDialogProps {
  onClose: () => void
  onCreated: (project: MapProjectSummary) => void
}

export function NewProjectDialog({ onClose, onCreated }: NewProjectDialogProps): JSX.Element {
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')
  const [width, setWidth] = useState(8)
  const [height, setHeight] = useState(8)
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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
            Breite (Squares)
            <input
              type="number"
              min={2}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label>
            Höhe (Squares)
            <input
              type="number"
              min={2}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </label>
        </div>

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
