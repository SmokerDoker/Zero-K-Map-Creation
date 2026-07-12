import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MapProjectMetadata, MapProjectSummary } from '@zk-map/shared-types'

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
    throw new Error(`Ein Projekt existiert bereits unter ${projectPath}`)
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
    throw new Error(`Kein Zero-K-Map-Projekt gefunden (project.json fehlt in ${projectPath})`)
  }

  const raw = await readFile(projectFile, 'utf-8')
  const metadata = JSON.parse(raw) as MapProjectMetadata

  return { ...metadata, projectPath }
}
