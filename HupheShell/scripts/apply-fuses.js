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

async function flip(context) {
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

// Ondertekende builds (scripts/dist-mac-signed.sh) zetten de fuses al vóór het ondertekenen (apply-fuses-pack.js):
// een wijziging ná het ondertekenen maakt de handtekening ongeldig en de notarisatie zou falen.
module.exports = function afterSign(context) {
  if (process.env.HUPHE_SIGNED_BUILD) return undefined
  return flip(context)
}
module.exports.flip = flip
