/**
 * Electron Fuses — schakel gevaarlijke runtime-features uit in productiebuilds.
 * Wordt aangeroepen via afterSign in electron-builder.yml.
 *
 * Fuses zijn compile-time security flags die niet meer gewijzigd kunnen worden
 * zonder de binary opnieuw te signen. Ze voorkomen dat aanvallers bepaalde
 * Electron-features inschakelen via command-line flags of omgevingsvariabelen.
 */

const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const path = require('path')

module.exports = async function afterSign(context) {
  const { appOutDir, packager } = context
  const appName = packager.appInfo.productFilename

  let executablePath
  const platform = packager.platform.name
  if (platform === 'mac') {
    executablePath = path.join(appOutDir, `${appName}.app`, 'Contents', 'MacOS', appName)
  } else if (platform === 'windows') {
    executablePath = path.join(appOutDir, `${appName}.exe`)
  } else {
    executablePath = path.join(appOutDir, appName)
  }

  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    // Voorkomt dat Node.js CLI flags (--inspect, --eval) de renderer overnemen
    [FuseV1Options.RunAsNode]: false,
    // Voorkomt dat ELECTRON_RUN_AS_NODE omgevingsvariabele NodeIntegration inschakelt
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Voorkomt dat ELECTRON_ENABLE_STACK_DUMPING werkt in productie
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    // Voorkomt dat de app worden geladen met --repl of --interactive flags
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  })

  console.log(`[fuses] Toegepast op ${executablePath}`)
}
