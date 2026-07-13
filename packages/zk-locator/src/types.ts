export type ZkInstallationSource = 'steam' | 'standalone' | 'manual'

export interface ZkInstallation {
  /** Root folder of the Zero-K install (contains maps/, engine/, the launcher, etc.). */
  installDir: string
  /** Where compiled .sdd maps should be copied for local testing. */
  mapsDir: string
  source: ZkInstallationSource
  /** Absolute path to the game's normal launcher, if one could be located. */
  launcherPath: string | null
}
