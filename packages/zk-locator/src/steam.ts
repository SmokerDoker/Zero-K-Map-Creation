import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { extractInstallDir, extractLibraryPaths } from './vdf'
import { findLauncher, hasMapsFolder } from './common'
import type { ZkInstallation } from './types'

/** Zero-K's Steam app ID (steamcommunity.com/app/334920). */
export const ZERO_K_STEAM_APP_ID = '334920'

function defaultSteamRoots(): string[] {
  switch (process.platform) {
    case 'win32':
      return ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']
    case 'darwin':
      return [join(homedir(), 'Library', 'Application Support', 'Steam')]
    default:
      return [
        join(homedir(), '.steam', 'steam'),
        join(homedir(), '.local', 'share', 'Steam'),
        join(homedir(), '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam')
      ]
  }
}

function readLibraryPaths(steamRoot: string): string[] {
  const vdfPath = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return [steamRoot]
  try {
    const contents = readFileSync(vdfPath, 'utf-8')
    const paths = extractLibraryPaths(contents)
    return paths.length > 0 ? paths : [steamRoot]
  } catch {
    return [steamRoot]
  }
}

/** Finds Zero-K installed via Steam by reading libraryfolders.vdf across all configured Steam library drives. */
export function findSteamInstallations(): ZkInstallation[] {
  const found: ZkInstallation[] = []

  for (const steamRoot of defaultSteamRoots()) {
    if (!existsSync(steamRoot)) continue

    for (const libraryPath of readLibraryPaths(steamRoot)) {
      const manifestPath = join(libraryPath, 'steamapps', `appmanifest_${ZERO_K_STEAM_APP_ID}.acf`)
      if (!existsSync(manifestPath)) continue

      let installDirName = 'Zero-K'
      try {
        installDirName = extractInstallDir(readFileSync(manifestPath, 'utf-8')) ?? installDirName
      } catch {
        // fall back to the conventional folder name below
      }

      const installDir = join(libraryPath, 'steamapps', 'common', installDirName)
      if (!existsSync(installDir) || !hasMapsFolder(installDir)) continue

      found.push({
        installDir,
        mapsDir: join(installDir, 'maps'),
        source: 'steam',
        launcherPath: findLauncher(installDir)
      })
    }
  }

  return found
}
