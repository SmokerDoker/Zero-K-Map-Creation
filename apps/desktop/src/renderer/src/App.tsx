import { useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { NewProjectDialog } from './NewProjectDialog'
import { TerrainEditor } from './TerrainEditor'
import { MapInfoForm } from './MapInfoForm'
import { StartboxEditor } from './StartboxEditor'
import { MetalSpotEditor } from './MetalSpotEditor'

type View = 'project' | 'terrain' | 'mapinfo' | 'startboxes' | 'metal'

function App(): JSX.Element {
  const [project, setProject] = useState<MapProjectSummary | null>(null)
  const [view, setView] = useState<View>('project')
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpenProject(): Promise<void> {
    setError(null)
    try {
      const opened = await window.api.pickAndOpenProject()
      if (opened) setProject(opened)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (project && view === 'terrain') {
    return <TerrainEditor project={project} onBack={() => setView('project')} />
  }

  if (project && view === 'mapinfo') {
    return <MapInfoForm project={project} onBack={() => setView('project')} />
  }

  if (project && view === 'startboxes') {
    return <StartboxEditor project={project} onBack={() => setView('project')} />
  }

  if (project && view === 'metal') {
    return <MetalSpotEditor project={project} onBack={() => setView('project')} />
  }

  if (project) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>{project.name}</h1>
          <p className="subtitle">
            von {project.author || 'Unbekannt'} · {project.size.width}×{project.size.height}
          </p>
        </header>
        <main>
          <p>{project.description || 'Keine Beschreibung.'}</p>
          <p className="project-path">{project.projectPath}</p>
          <div className="project-actions">
            <button onClick={() => setView('terrain')}>Terrain bearbeiten</button>
            <button onClick={() => setView('mapinfo')}>Kartendaten</button>
            <button onClick={() => setView('startboxes')}>Startboxen</button>
            <button onClick={() => setView('metal')}>Metal-Spots</button>
          </div>
          <button
            onClick={() => {
              setProject(null)
              setView('project')
            }}
          >
            Zurück zum Dashboard
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Zero-K Map Creator</h1>
        <p className="subtitle">Custom Maps erstellen, bearbeiten, testen und veröffentlichen.</p>
      </header>
      <main className="dashboard">
        <button onClick={() => setShowNewProjectDialog(true)}>Neues Projekt</button>
        <button onClick={handleOpenProject}>Projekt öffnen</button>
        {error && <p className="error">{error}</p>}
      </main>
      {showNewProjectDialog && (
        <NewProjectDialog
          onClose={() => setShowNewProjectDialog(false)}
          onCreated={(created) => {
            setProject(created)
            setShowNewProjectDialog(false)
          }}
        />
      )}
    </div>
  )
}

export default App
