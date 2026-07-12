import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createProject, openProject, type CreateProjectInput } from './project'
import { loadTerrain, saveTerrain } from './terrain'

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
