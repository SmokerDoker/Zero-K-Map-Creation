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
  pickParentDir: (): Promise<string | null> => ipcRenderer.invoke('project:pickParentDir'),
  createProject: (input: NewProjectInput): Promise<MapProjectSummary> =>
    ipcRenderer.invoke('project:create', input),
  pickAndOpenProject: (): Promise<MapProjectSummary | null> =>
    ipcRenderer.invoke('project:pickAndOpen')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
