/**
 * Minimal Steam VDF (Valve Data Format) helpers — just enough to read `libraryfolders.vdf` and
 * `appmanifest_*.acf` files, not a full VDF parser.
 */

/** Extracts every `"path"  "value"` pair's value from a libraryfolders.vdf file's contents. */
export function extractLibraryPaths(vdfContents: string): string[] {
  const paths: string[] = []
  const regex = /"path"\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(vdfContents)) !== null) {
    paths.push(unescapeVdfString(match[1]))
  }
  return paths
}

/** Reads the `"installdir"  "value"` entry from an appmanifest_<appid>.acf file's contents. */
export function extractInstallDir(acfContents: string): string | null {
  const match = /"installdir"\s+"([^"]+)"/.exec(acfContents)
  return match ? unescapeVdfString(match[1]) : null
}

function unescapeVdfString(value: string): string {
  return value.replace(/\\\\/g, '\\')
}
