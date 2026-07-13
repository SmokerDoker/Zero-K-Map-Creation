import { add } from 'node-7z'
import { path7za } from '7zip-bin'
import { join } from 'node:path'

/**
 * Packages a compiled .sdd directory into a .sd7 archive at the archive root (no wrapping
 * ".sdd" folder entry — mapinfo.lua etc. must sit directly at the top level) using non-solid
 * compression, per the pitfalls documented in Zero-K's map-making guide.
 */
export function packageSdd(sddDir: string, sd7Path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = add(sd7Path, join(sddDir, '*'), {
      $bin: path7za,
      recursive: true,
      archiveType: '7z',
      $raw: ['-ms=off']
    })
    stream.on('end', () => resolve())
    stream.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
  })
}
