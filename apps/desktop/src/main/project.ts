import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MapProjectMetadata, MapProjectSummary } from '@zk-map/shared-types'
import { t } from './language'

export interface CreateProjectInput {
  parentDir: string
  name: string
  author: string
  description: string
  size: { width: number; height: number }
}

const PROJECT_FILE = 'project.json'

function projectDirName(name: string): string {
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return `${safe}.zkmap`
}

export async function createProject(input: CreateProjectInput): Promise<MapProjectSummary> {
  const projectPath = join(input.parentDir, projectDirName(input.name))
  if (existsSync(projectPath)) {
    throw new Error(t('project.error.exists', { path: projectPath }))
  }

  await mkdir(join(projectPath, 'source'), { recursive: true })
  await mkdir(join(projectPath, 'generated'), { recursive: true })

  const now = new Date().toISOString()
  const metadata: MapProjectMetadata = {
    schemaVersion: 1,
    name: input.name,
    author: input.author,
    version: '1.0',
    description: input.description,
    size: input.size,
    createdAt: now,
    updatedAt: now
  }

  await writeFile(join(projectPath, PROJECT_FILE), JSON.stringify(metadata, null, 2), 'utf-8')

  return { ...metadata, projectPath }
}

export async function openProject(projectPath: string): Promise<MapProjectSummary> {
  const projectFile = join(projectPath, PROJECT_FILE)
  if (!existsSync(projectFile)) {
    throw new Error(t('project.error.notFound', { path: projectPath }))
  }

  const raw = await readFile(projectFile, 'utf-8')
  const metadata = JSON.parse(raw) as MapProjectMetadata

  return { ...metadata, projectPath }
}

/** The project.json fields that stay editable after a project has been created. */
export type EditableProjectMetadata = Pick<MapProjectMetadata, 'name' | 'author' | 'description' | 'version'>

export async function updateProjectMetadata(
  projectPath: string,
  patch: EditableProjectMetadata
): Promise<MapProjectSummary> {
  if (!patch.name.trim()) throw new Error(t('project.error.nameRequired'))
  if (!patch.version.trim()) throw new Error(t('project.error.versionRequired'))

  const current = await openProject(projectPath)
  const { projectPath: _ignored, ...metadata } = current
  const next: MapProjectMetadata = {
    ...metadata,
    name: patch.name.trim(),
    author: patch.author,
    description: patch.description,
    version: patch.version.trim(),
    updatedAt: new Date().toISOString()
  }
  await writeFile(join(projectPath, PROJECT_FILE), JSON.stringify(next, null, 2), 'utf-8')
  return { ...next, projectPath }
}
