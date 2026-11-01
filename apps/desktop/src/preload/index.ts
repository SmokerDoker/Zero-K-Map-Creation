import { contextBridge, ipcRenderer } from 'electron'
import type { FeatureLayout, MapProjectSummary } from '@zk-map/shared-types'
import type { MetalLayout, StartboxConfig } from '@zk-map/map-lua'
import type { GameplaySettings } from '../main/mapconfig'
import type { CompileProgress, CompileResult } from '../main/compile/progress'
import type { TestInZeroKResult } from '../main/test-in-zk'
import type { EditableProjectMetadata } from '../main/project'
import type { ImportedHeightmap } from '../main/heightmap-io'
import type { ZkInstallation } from '@zk-map/zk-locator'
import type { Language } from '../shared/i18n'

export interface NewProjectInput {
  parentDir: string
  name: string
  author: string
  description: string
  size: { width: number; height: number }
}

const api = {
  setLanguage: (lang: Language): Promise<void> => ipcRenderer.invoke('app:setLanguage', lang),
  setDirty: (dirty: boolean): Promise<void> => ipcRenderer.invoke('app:setDirty', dirty),
  closeAfterSave: (): Promise<void> => ipcRenderer.invoke('app:closeAfterSave'),
  /** Registers the handler for "Save" in the native unsaved-changes dialog. Returns an unsubscribe fn. */
  onSaveAndClose: (handler: () => void): (() => void) => {
    const listener = (): void => handler()
    ipcRenderer.on('app:saveAndClose', listener)
    return () => ipcRenderer.removeListener('app:saveAndClose', listener)
  },
  onCompileProgress: (handler: (progress: CompileProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: CompileProgress): void => handler(progress)
    ipcRenderer.on('compile:progress', listener)
    return () => ipcRenderer.removeListener('compile:progress', listener)
  },
  getDefaultProjectsDir: (): Promise<string> => ipcRenderer.invoke('project:getDefaultProjectsDir'),
  pickParentDir: (): Promise<string | null> => ipcRenderer.invoke('project:pickParentDir'),
  createProject: (input: NewProjectInput): Promise<MapProjectSummary> =>
    ipcRenderer.invoke('project:create', input),
  pickAndOpenProject: (): Promise<MapProjectSummary | null> =>
    ipcRenderer.invoke('project:pickAndOpen'),
  updateProjectMetadata: (
    projectPath: string,
    patch: EditableProjectMetadata
  ): Promise<MapProjectSummary> => ipcRenderer.invoke('project:updateMetadata', projectPath, patch),
  importHeightmap: (
    targetWidth: number,
    targetHeight: number
  ): Promise<(ImportedHeightmap & { fileName: string }) | null> =>
    ipcRenderer.invoke('heightmap:import', targetWidth, targetHeight),
  exportHeightmap: (
    suggestedName: string,
    heights: Float32Array,
    width: number,
    height: number
  ): Promise<string | null> =>
    ipcRenderer.invoke('heightmap:export', suggestedName, heights, width, height),
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
  cancelCompile: (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('map:cancelCompile', projectPath),
  showInFolder: (targetPath: string): Promise<void> =>
    ipcRenderer.invoke('shell:showInFolder', targetPath),
  detectZkInstallations: (): Promise<ZkInstallation[]> =>
    ipcRenderer.invoke('zk:detectInstallations'),
  pickZkInstallDir: (): Promise<ZkInstallation | null> => ipcRenderer.invoke('zk:pickInstallDir'),
  testInZeroK: (projectPath: string, installation: ZkInstallation): Promise<TestInZeroKResult> =>
    ipcRenderer.invoke('zk:testMap', projectPath, installation),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
