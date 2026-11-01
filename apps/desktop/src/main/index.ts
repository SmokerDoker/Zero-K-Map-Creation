import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { basename, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  createProject,
  openProject,
  updateProjectMetadata,
  type CreateProjectInput,
  type EditableProjectMetadata
} from './project'
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
import { cancelCompile, compileProject } from './compile'
import { testInZeroK } from './test-in-zk'
import { detectZkInstallations, validateManualPath, type ZkInstallation } from '@zk-map/zk-locator'
import { setMainLanguage, t } from './language'
import { isLanguage } from '../shared/i18n'
import { encodeHeightmapPng, importHeightmap } from './heightmap-io'

/** Per-OS default location for user-created map projects (e.g. %APPDATA%\Zero-K Map Creator\Projects on Windows). */
function getDefaultProjectsDir(): string {
  return join(app.getPath('userData'), 'Projects')
}

/** Windows whose renderer currently holds unsaved edits (reported via 'app:setDirty'). */
const dirtyWindows = new WeakSet<BrowserWindow>()
/** Windows the user already agreed to close despite unsaved edits. */
const forceCloseWindows = new WeakSet<BrowserWindow>()

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

  // Never lose edits silently: closing the window (or quitting the app) with unsaved changes asks
  // first. "Save" round-trips through the renderer, which owns the in-memory map data.
  mainWindow.on('close', (event) => {
    if (forceCloseWindows.has(mainWindow) || !dirtyWindows.has(mainWindow)) return
    event.preventDefault()
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: [t('unsaved.save'), t('unsaved.discard'), t('unsaved.cancel')],
      defaultId: 0,
      cancelId: 2,
      title: t('unsaved.title'),
      message: t('unsaved.message'),
      detail: t('unsaved.detail')
    })
    if (choice === 0) {
      mainWindow.webContents.send('app:saveAndClose')
    } else if (choice === 1) {
      forceCloseWindows.add(mainWindow)
      mainWindow.close()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://')) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('app:setLanguage', (_event, lang: unknown) => {
  if (isLanguage(lang)) setMainLanguage(lang)
})

ipcMain.handle('app:setDirty', (event, dirty: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (dirty) dirtyWindows.add(win)
  else dirtyWindows.delete(win)
})

/** Sent by the renderer once a save requested via 'app:saveAndClose' has succeeded. */
ipcMain.handle('app:closeAfterSave', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  dirtyWindows.delete(win)
  win.close()
})

ipcMain.handle('project:getDefaultProjectsDir', () => getDefaultProjectsDir())

ipcMain.handle('project:pickParentDir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: t('dialog.pickParentDir'),
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
    title: t('dialog.openProject'),
    defaultPath: getDefaultProjectsDir()
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return openProject(result.filePaths[0])
})

ipcMain.handle(
  'project:updateMetadata',
  async (_event, projectPath: string, patch: EditableProjectMetadata) => {
    return updateProjectMetadata(projectPath, patch)
  }
)

ipcMain.handle(
  'terrain:load',
  async (_event, projectPath: string, width: number, height: number) => {
    return loadTerrain(projectPath, width, height)
  }
)

ipcMain.handle('terrain:save', async (_event, projectPath: string, heights: Float32Array) => {
  await saveTerrain(projectPath, heights)
})

ipcMain.handle('heightmap:import', async (_event, targetWidth: number, targetHeight: number) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: t('dialog.importHeightmap'),
    filters: [
      { name: t('dialog.filter.heightmaps'), extensions: ['png', 'raw', 'r16'] },
      { name: 'PNG', extensions: ['png'] },
      { name: 'RAW 16-bit', extensions: ['raw', 'r16'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const bytes = await readFile(filePath)
  try {
    const imported = importHeightmap(new Uint8Array(bytes), filePath, targetWidth, targetHeight)
    return { ...imported, fileName: basename(filePath) }
  } catch (err) {
    throw new Error(
      t('heightmap.error.decode', { message: err instanceof Error ? err.message : String(err) })
    )
  }
})

ipcMain.handle(
  'heightmap:export',
  async (_event, suggestedName: string, heights: Float32Array, width: number, height: number) => {
    const result = await dialog.showSaveDialog({
      title: t('dialog.exportHeightmap'),
      defaultPath: `${suggestedName}_heightmap.png`,
      filters: [{ name: 'PNG (16-bit)', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, encodeHeightmapPng(heights, width, height))
    return result.filePath
  }
)

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

ipcMain.handle('map:compile', async (event, projectPath: string) => {
  return compileProject(projectPath, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('compile:progress', progress)
  })
})

ipcMain.handle('map:cancelCompile', (_event, projectPath: string) => cancelCompile(projectPath))

ipcMain.handle('shell:showInFolder', (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath)
})

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  if (!url.startsWith('https://')) {
    throw new Error(t('error.httpsOnly', { url }))
  }
  return shell.openExternal(url)
})

ipcMain.handle('zk:detectInstallations', () => detectZkInstallations())

ipcMain.handle('zk:pickInstallDir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: t('dialog.pickZkDir')
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return validateManualPath(result.filePaths[0])
})

ipcMain.handle(
  'zk:testMap',
  async (event, projectPath: string, installation: ZkInstallation) => {
    return testInZeroK(projectPath, installation, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('compile:progress', progress)
    })
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
