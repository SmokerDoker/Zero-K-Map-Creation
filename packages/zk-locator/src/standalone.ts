import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { hasMapsFolder, toInstallation } from './common'
import type { ZkInstallation } from './types'

/**
 * Well-known locations for the standalone (non-Steam) zero-k.info installer. This is inherently
 * best-effort — unlike Steam there's no manifest to consult — so a manual folder picker is always
 * offered as a fallback in the UI regardless of what this finds.
 */
function candidatePaths(): string[] {
  const home = homedir()
  switch (process.platform) {
    case 'win32': {
      const localAppData = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local')
      const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files'
      const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
      return [
        join(localAppData, 'Zero-K'),
        join(programFiles, 'Zero-K'),
        join(programFilesX86, 'Zero-K'),
        join(home, 'Zero-K')
      ]
    }
    case 'darwin':
      return [join(home, 'Applications', 'Zero-K.app'), join('/Applications', 'Zero-K.app')]
    default:
      return [
        join(home, 'Zero-K'),
        join(home, '.local', 'share', 'Zero-K'),
        join(home, 'games', 'Zero-K')
      ]
  }
}

export function findStandaloneInstallations(): ZkInstallation[] {
  const found: ZkInstallation[] = []
  for (const installDir of candidatePaths()) {
    if (existsSync(installDir) && hasMapsFolder(installDir)) {
      found.push(toInstallation(installDir, 'standalone'))
    }
  }
  return found
}

/** Validates a user-picked folder as a usable Zero-K install (must at least have a maps/ folder). */
export function validateManualPath(installDir: string): ZkInstallation | null {
  if (!existsSync(installDir) || !hasMapsFolder(installDir)) return null
  return toInstallation(installDir, 'manual')
}
