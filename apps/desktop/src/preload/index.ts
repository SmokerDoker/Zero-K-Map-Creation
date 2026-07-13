import { contextBridge, ipcRenderer } from 'electron'
import type { FeatureLayout, MapProjectSummary } from '@zk-map/shared-types'
import type { MetalLayout, StartboxConfig } from '@zk-map/map-lua'
import type { GameplaySettings } from '../main/mapconfig'
import type { CompileResult } from '../main/compile'
import type { TestInZeroKResult } from '../main/test-in-zk'
import type { ZkInstallation } from '@zk-map/zk-locator'

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
    ipcRenderer.invoke('mapconfig:saveMetalLayout', projectPath, layout),
  loadFeatures: (projectPath: string): Promise<FeatureLayout> =>
    ipcRenderer.invoke('mapconfig:loadFeatures', projectPath),
  saveFeatures: (projectPath: string, layout: FeatureLayout): Promise<void> =>
    ipcRenderer.invoke('mapconfig:saveFeatures', projectPath, layout),
  compileProject: (projectPath: string): Promise<CompileResult> =>
    ipcRenderer.invoke('map:compile', projectPath),
  showInFolder: (targetPath: string): Promise<void> =>
    ipcRenderer.invoke('shell:showInFolder', targetPath),
  detectZkInstallations: (): Promise<ZkInstallation[]> =>
    ipcRenderer.invoke('zk:detectInstallations'),
  pickZkInstallDir: (): Promise<ZkInstallation | null> => ipcRenderer.invoke('zk:pickInstallDir'),
  testInZeroK: (projectPath: string, installation: ZkInstallation): Promise<TestInZeroKResult> =>
    ipcRenderer.invoke('zk:testMap', projectPath, installation)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
