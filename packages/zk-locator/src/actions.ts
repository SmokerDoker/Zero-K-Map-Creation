import { cp, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import type { ZkInstallation } from './types'

/** Copies a compiled .sdd folder into the install's maps/ folder for local testing. */
export async function copyMapToZeroK(sddPath: string, installation: ZkInstallation): Promise<string> {
  const destination = join(installation.mapsDir, basename(sddPath))
  await mkdir(installation.mapsDir, { recursive: true })
  await cp(sddPath, destination, { recursive: true, force: true })
  return destination
}

/**
 * Starts Zero-K's normal launcher. There is no verified way to jump straight into a specific map
 * (Spring's script.txt bypasses the lobby entirely and its exact fields for Zero-K's game rules
 * aren't confirmed) — the map still needs to be picked manually in the Skirmish menu once the
 * game is up, same as the documented manual testing workflow.
 */
export function launchZeroK(installation: ZkInstallation): void {
  if (!installation.launcherPath) {
    throw new Error('Kein Zero-K-Launcher gefunden — bitte Zero-K manuell starten.')
  }

  if (process.platform === 'darwin' && installation.launcherPath.endsWith('.app')) {
    spawn('open', [installation.launcherPath], { detached: true, stdio: 'ignore' }).unref()
    return
  }

  spawn(installation.launcherPath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: installation.installDir
  }).unref()
}
