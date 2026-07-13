import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createProject, openProject, type CreateProjectInput } from './project'
import { loadTerrain, saveTerrain } from './terrain'
import {
  loadGameplaySettings,
  saveGameplaySettings,
  loadStartboxes,
  saveStartboxes,
  loadMetalLayout,
  saveMetalLayout,
  loadFeatures,
  saveFeatures,
  type GameplaySettings
} from './mapconfig'
import type { MetalLayout, StartboxConfig } from '@zk-map/map-lua'
import type { FeatureLayout } from '@zk-map/shared-types'
import { compileProject } from './compile'
import { testInZeroK } from './test-in-zk'
import { detectZkInstallations, validateManualPath, type ZkInstallation } from '@zk-map/zk-locator'

/** Per-OS default location for user-created map projects (e.g. %APPDATA%\Zero-K Map Creator\Projects on Windows). */
function getDefaultProjectsDir(): string {
  return join(app.getPath('userData'), 'Projects')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('project:getDefaultProjectsDir', () => getDefaultProjectsDir())

ipcMain.handle('project:pickParentDir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Speicherort für das neue Projekt wählen',
    defaultPath: getDefaultProjectsDir()
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('project:create', async (_event, input: CreateProjectInput) => {
  return createProject(input)
})

ipcMain.handle('project:pickAndOpen', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Projektordner (.zkmap) öffnen',
    defaultPath: getDefaultProjectsDir()
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return openProject(result.filePaths[0])
})

ipcMain.handle(
  'terrain:load',
  async (_event, projectPath: string, width: number, height: number) => {
    return loadTerrain(projectPath, width, height)
  }
)

ipcMain.handle('terrain:save', async (_event, projectPath: string, heights: Float32Array) => {
  await saveTerrain(projectPath, heights)
})

ipcMain.handle('mapconfig:loadGameplaySettings', async (_event, projectPath: string) => {
  return loadGameplaySettings(projectPath)
})

ipcMain.handle(
  'mapconfig:saveGameplaySettings',
  async (_event, projectPath: string, settings: GameplaySettings) => {
    await saveGameplaySettings(projectPath, settings)
  }
)

ipcMain.handle(
  'mapconfig:loadStartboxes',
  async (_event, projectPath: string, worldWidth: number, worldHeight: number) => {
    return loadStartboxes(projectPath, worldWidth, worldHeight)
  }
)

ipcMain.handle(
  'mapconfig:saveStartboxes',
  async (_event, projectPath: string, config: StartboxConfig) => {
    await saveStartboxes(projectPath, config)
  }
)

ipcMain.handle('mapconfig:loadMetalLayout', async (_event, projectPath: string) => {
  return loadMetalLayout(projectPath)
})

ipcMain.handle(
  'mapconfig:saveMetalLayout',
  async (_event, projectPath: string, layout: MetalLayout) => {
    await saveMetalLayout(projectPath, layout)
  }
)

ipcMain.handle('mapconfig:loadFeatures', async (_event, projectPath: string) => {
  return loadFeatures(projectPath)
})

ipcMain.handle(
  'mapconfig:saveFeatures',
  async (_event, projectPath: string, layout: FeatureLayout) => {
    await saveFeatures(projectPath, layout)
  }
)

ipcMain.handle('map:compile', async (_event, projectPath: string) => {
  return compileProject(projectPath)
})

ipcMain.handle('shell:showInFolder', (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath)
})

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  if (!url.startsWith('https://')) {
    throw new Error(`Nur https-URLs dürfen extern geöffnet werden: ${url}`)
  }
  return shell.openExternal(url)
})

ipcMain.handle('zk:detectInstallations', () => detectZkInstallations())

ipcMain.handle('zk:pickInstallDir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Zero-K-Installationsordner wählen'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return validateManualPath(result.filePaths[0])
})

ipcMain.handle(
  'zk:testMap',
  async (_event, projectPath: string, installation: ZkInstallation) => {
    return testInZeroK(projectPath, installation)
  }
)

app.whenReady().then(async () => {
  await mkdir(getDefaultProjectsDir(), { recursive: true })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
