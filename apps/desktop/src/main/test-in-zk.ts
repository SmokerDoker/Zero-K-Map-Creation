import { copyMapToZeroK, launchZeroK, type ZkInstallation } from '@zk-map/zk-locator'
import { compileProject } from './compile'

export interface TestInZeroKResult {
  compiledSddPath: string
  copiedToPath: string
  launched: boolean
  warnings: string[]
}

/** Compiles the project fresh, copies the result into the given install's maps/ folder, and
 * starts Zero-K's normal launcher. The map still has to be picked manually once the game is up
 * (see zk-locator's launchZeroK doc comment for why there's no verified direct-map-launch path). */
export async function testInZeroK(
  projectPath: string,
  installation: ZkInstallation
): Promise<TestInZeroKResult> {
  const compileResult = await compileProject(projectPath)
  const copiedToPath = await copyMapToZeroK(compileResult.sddPath, installation)

  const warnings = [...compileResult.warnings]
  let launched = false
  try {
    launchZeroK(installation)
    launched = true
  } catch (err) {
    warnings.push(err instanceof Error ? err.message : String(err))
  }

  return { compiledSddPath: compileResult.sddPath, copiedToPath, launched, warnings }
}
