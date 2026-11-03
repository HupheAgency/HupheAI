#!/usr/bin/env bash
# Ondertekende en genotariseerde Mac-build voor distributie aan anderen.
#
# Eenmalig nodig:
#   - Apple Developer-account (99 USD/jaar) en een "Developer ID Application"-certificaat in je Sleutelhanger
#   - een app-specifiek wachtwoord (appleid.apple.com → Aanmelden en beveiliging)
#   - een LGPL-FFmpeg in build/bin:  ARCH=universal scripts/build-ffmpeg-lgpl.sh
#
#   export APPLE_ID="jij@voorbeeld.nl" APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" APPLE_TEAM_ID="ABCDE12345"
#   export CSC_NAME="Naam Achternaam (ABCDE12345)"      # de naam van het certificaat, zonder "Developer ID Application:"
#   scripts/dist-mac-signed.sh
set -euo pipefail
cd "$(dirname "$0")/.."

for v in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID CSC_NAME; do
  [ -n "${!v:-}" ] || { echo "Zet eerst $v (zie de uitleg bovenaan dit script)." >&2; exit 1; }
done
node scripts/verify-ffmpeg-lgpl.mjs
# Moet in elke architectuur van het pakket draaien: arm64 én x86_64.
for f in build/bin/ffmpeg build/bin/ffprobe build/bin/lib/*.dylib; do
  archs="$(lipo -archs "$f")"
  case "$archs" in *arm64*x86_64*|*x86_64*arm64*) ;; *) echo "$f bevat alleen: $archs. Bouw met ARCH=universal." >&2; exit 1 ;; esac
done

node scripts/download-brush.mjs
npm run build:safe
# Hardened runtime + notarisatie staan bewust alleen hier aan; de gewone build (npm run dist:mac) blijft ongewijzigd.
# electron-builder ondertekent ook de binaries en bibliotheken in Resources/bin.
export HUPHE_SIGNED_BUILD=1
npx electron-builder --mac \
  -c.afterPack=scripts/apply-fuses-pack.js \
  -c.mac.identity="$CSC_NAME" \
  -c.mac.hardenedRuntime=true \
  -c.mac.entitlements=scripts/entitlements.mac.plist \
  -c.mac.entitlementsInherit=scripts/entitlements.mac.plist \
  -c.mac.notarize=true
echo "✓ Klaar in dist/. Test het resultaat op een andere Mac: openen, importeren en exporteren."
