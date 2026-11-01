import { useEffect, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { useI18n } from './i18n'
import { formatError } from './errors'

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
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')
  const [width, setWidth] = useState(8)
  const [height, setHeight] = useState(8)
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Pre-fill with the OS-specific default location (e.g. %APPDATA%\Zero-K Map Creator\Projects);
  // picking a different folder via "Choose…" is still possible.
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
      setError(t('newProject.error.noFolder'))
      return
    }
    if (!name.trim()) {
      setError(t('newProject.error.noName'))
      return
    }
    if (!isValidSize(width) || !isValidSize(height)) {
      setError(t('newProject.error.invalidSize'))
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
      setError(formatError(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <form className="dialog" onSubmit={handleSubmit}>
        <h2>{t('newProject.title')}</h2>

        <label>
          {t('newProject.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <label>
          {t('newProject.author')}
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>

        <label>
          {t('newProject.description')}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="size-row">
          <label>
            {t('newProject.width')}
            <input
              type="number"
              min={2}
              step={2}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label>
            {t('newProject.height')}
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
          {t('newProject.sizeHint')}
        </p>
        {(width > LARGE_SIZE_WARNING_THRESHOLD || height > LARGE_SIZE_WARNING_THRESHOLD) && (
          <p className="hint warning">
            {t('newProject.largeWarning')}
          </p>
        )}

        <label>
          {t('newProject.location')}
          <div className="folder-row">
            <span>{parentDir ?? t('newProject.noFolder')}</span>
            <button type="button" onClick={handleChooseFolder}>
              {t('newProject.choose')}
            </button>
          </div>
        </label>

        {error && <p className="error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={creating}>
            {creating ? t('newProject.creating') : t('newProject.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
