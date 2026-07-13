import { contextBridge, ipcRenderer } from 'electron'
import type { MapProjectSummary } from '@zk-map/shared-types'
import type { MetalLayout, StartboxConfig } from '@zk-map/map-lua'
import type { GameplaySettings } from '../main/mapconfig'

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
    ipcRenderer.invoke('terrain:save', projectPath, heights),
  loadGameplaySettings: (projectPath: string): Promise<GameplaySettings> =>
    ipcRenderer.invoke('mapconfig:loadGameplaySettings', projectPath),
  saveGameplaySettings: (projectPath: string, settings: GameplaySettings): Promise<void> =>
    ipcRenderer.invoke('mapconfig:saveGameplaySettings', projectPath, settings),
  loadStartboxes: (
    projectPath: string,
    worldWidth: number,
    worldHeight: number
  ): Promise<StartboxConfig> =>
    ipcRenderer.invoke('mapconfig:loadStartboxes', projectPath, worldWidth, worldHeight),
  saveStartboxes: (projectPath: string, config: StartboxConfig): Promise<void> =>
    ipcRenderer.invoke('mapconfig:saveStartboxes', projectPath, config),
  loadMetalLayout: (projectPath: string): Promise<MetalLayout> =>
    ipcRenderer.invoke('mapconfig:loadMetalLayout', projectPath),
  saveMetalLayout: (projectPath: string, layout: MetalLayout): Promise<void> =>
    ipcRenderer.invoke('mapconfig:saveMetalLayout', projectPath, layout)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
