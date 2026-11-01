// electron-builder afterPack hook.
//
// The macOS builds are not signed with an Apple Developer ID. On Apple Silicon an app must carry
// at least an ad-hoc signature to run at all, and electron-builder's packaging step (renaming the
// app, rewriting Info.plist) invalidates the signature that ships with Electron's prebuilt binary.
// Re-signing ad-hoc here keeps the app launchable; users only need to clear the quarantine flag
// once (see README).
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
