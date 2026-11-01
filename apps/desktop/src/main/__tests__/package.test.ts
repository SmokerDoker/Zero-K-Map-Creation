import { describe, expect, it } from 'vitest'
import { resolve7zaPath } from '../compile/package'

describe('resolve7zaPath', () => {
  it('redirects into app.asar.unpacked in a packaged app', () => {
    expect(resolve7zaPath('/opt/app/resources/app.asar/node_modules/7zip-bin/linux/x64/7za')).toBe(
      '/opt/app/resources/app.asar.unpacked/node_modules/7zip-bin/linux/x64/7za'
    )
    expect(resolve7zaPath('C:\\Program Files\\ZK\\resources\\app.asar\\node_modules\\7zip-bin\\win\\x64\\7za.exe')).toBe(
      'C:\\Program Files\\ZK\\resources\\app.asar.unpacked\\node_modules\\7zip-bin\\win\\x64\\7za.exe'
    )
  })

  it('leaves dev paths alone', () => {
    const dev = '/home/me/repo/node_modules/7zip-bin/linux/x64/7za'
    expect(resolve7zaPath(dev)).toBe(dev)
  })
})
