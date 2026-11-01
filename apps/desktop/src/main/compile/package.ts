import { add } from 'node-7z'
import { path7za } from '7zip-bin'
import { join } from 'node:path'

/** In a packaged app 7zip-bin resolves to a path inside app.asar, which can't be executed. The
 * binary itself is shipped unpacked (see asarUnpack in electron-builder.yml), so point there. */
export function resolve7zaPath(rawPath: string = path7za): string {
  return rawPath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}

/**
 * Packages a compiled .sdd directory into a .sd7 archive at the archive root (no wrapping
 * ".sdd" folder entry — mapinfo.lua etc. must sit directly at the top level) using non-solid
 * compression, per the pitfalls documented in Zero-K's map-making guide.
 */
export function packageSdd(
  sddDir: string,
  sd7Path: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = add(sd7Path, join(sddDir, '*'), {
      $bin: resolve7zaPath(),
      recursive: true,
      archiveType: '7z',
      $raw: ['-ms=off'],
      $progress: true
    })
    stream.on('progress', (progress: { percent?: number }) => {
      if (typeof progress.percent === 'number') onProgress?.(progress.percent / 100)
    })
    stream.on('end', () => resolve())
    stream.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
  })
}
