import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Candidate launcher filenames to look for at the root of a Zero-K install, per platform. */
function launcherCandidates(): string[] {
  switch (process.platform) {
    case 'win32':
      return ['Zero-K.exe', 'zero-k.exe', 'ZeroK.exe']
    case 'darwin':
      return ['Zero-K.app']
    default:
      return ['zk.sh', 'Zero-K.sh', 'zero-k', 'Zero-K']
  }
}

export function findLauncher(installDir: string): string | null {
  for (const candidate of launcherCandidates()) {
    const candidatePath = join(installDir, candidate)
    if (existsSync(candidatePath)) return candidatePath
  }
  return null
}

/** A folder only counts as a real Zero-K install if it actually has somewhere to put maps. */
export function hasMapsFolder(installDir: string): boolean {
  return existsSync(join(installDir, 'maps'))
}

export function toInstallation(
  installDir: string,
  source: 'steam' | 'standalone' | 'manual'
): { installDir: string; mapsDir: string; source: typeof source; launcherPath: string | null } {
  return {
    installDir,
    mapsDir: join(installDir, 'maps'),
    source,
    launcherPath: findLauncher(installDir)
  }
}
