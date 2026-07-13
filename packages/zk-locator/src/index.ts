import { findSteamInstallations } from './steam'
import { findStandaloneInstallations, validateManualPath } from './standalone'
import type { ZkInstallation } from './types'

export * from './types'
export { findSteamInstallations, ZERO_K_STEAM_APP_ID } from './steam'
export { findStandaloneInstallations, validateManualPath } from './standalone'
export { copyMapToZeroK, launchZeroK } from './actions'
export { extractLibraryPaths, extractInstallDir } from './vdf'

/** Finds all Zero-K installations across Steam and known standalone locations, de-duplicated. */
export function detectZkInstallations(): ZkInstallation[] {
  const all = [...findSteamInstallations(), ...findStandaloneInstallations()]
  const seen = new Set<string>()
  const unique: ZkInstallation[] = []
  for (const installation of all) {
    const key = installation.installDir.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(installation)
  }
  return unique
}
