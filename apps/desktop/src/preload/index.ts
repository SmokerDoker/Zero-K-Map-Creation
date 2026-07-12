import { contextBridge, ipcRenderer } from 'electron'
import type { MapProjectSummary } from '@zk-map/shared-types'

export interface NewProjectInput {
  parentDir: string
  name: string
  author: string
  description: string
  size: { width: number; height: number }
}

const api = {
  getDefaultProjectsDir: (): Promise<string> => ipcRenderer.invoke('project:getDefaultProjectsDir'),
  pickParentDir: (): Promise<string | null> => ipcRenderer.invoke('project:pickParentDir'),
  createProject: (input: NewProjectInput): Promise<MapProjectSummary> =>
    ipcRenderer.invoke('project:create', input),
  pickAndOpenProject: (): Promise<MapProjectSummary | null> =>
    ipcRenderer.invoke('project:pickAndOpen'),
  loadTerrain: (projectPath: string, width: number, height: number): Promise<Float32Array> =>
    ipcRenderer.invoke('terrain:load', projectPath, width, height),
  saveTerrain: (projectPath: string, heights: Float32Array): Promise<void> =>
    ipcRenderer.invoke('terrain:save', projectPath, heights)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
