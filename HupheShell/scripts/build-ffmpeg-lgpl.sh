#!/usr/bin/env bash
# Bouwt een LGPL-FFmpeg (zonder GPL- en nonfree-onderdelen) voor in de app-bundel.
#
#   scripts/build-ffmpeg-lgpl.sh                 # arm64 of x86_64, passend bij deze Mac
#   ARCH=x86_64 scripts/build-ffmpeg-lgpl.sh     # andere architectuur (nasm nodig: brew install nasm)
#   ARCH=universal scripts/build-ffmpeg-lgpl.sh  # beide bouwen en samenvoegen (lipo)
#
# Resultaat: build/bin/ffmpeg, build/bin/ffprobe, build/bin/lib/*.dylib en build/licenses/ffmpeg/*.
# Daarna: node scripts/verify-ffmpeg-lgpl.mjs
set -euo pipefail

VERSION="${FFMPEG_VERSION:-8.0}"
# Pin: controle van de gedownloade broncode. Bij een andere versie FFMPEG_SHA256 meegeven.
SHA256="${FFMPEG_SHA256:-b2751fccb6cc4c77708113cd78b561059b6fa904b24162fa0be2d60273d27b8e}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK_DIR:-$APP/.local/ffmpeg-build}"
OUT="${OUT_DIR:-$APP/build/bin}"
LICENSES="${LICENSE_DIR:-$APP/build/licenses/ffmpeg}"
HOST="$(uname -m)"
ARCH="${ARCH:-$HOST}"
TARBALL="$WORK/ffmpeg-$VERSION.tar.xz"

mkdir -p "$WORK"
if [ ! -f "$TARBALL" ]; then
  echo "• Broncode downloaden (ffmpeg $VERSION)"
  curl -fSL -o "$TARBALL" "https://ffmpeg.org/releases/ffmpeg-$VERSION.tar.xz"
fi
if [ "$(shasum -a 256 "$TARBALL" | cut -d' ' -f1)" != "$SHA256" ]; then
  echo "Checksum van $TARBALL klopt niet; verwijder het bestand en controleer FFMPEG_SHA256." >&2
  exit 1
fi

build_arch() {
  local arch="$1" src="$WORK/src-$1" prefix="$WORK/install-$1"
  rm -rf "$src" "$prefix"
  mkdir -p "$src"
  tar -xJf "$TARBALL" -C "$src" --strip-components=1
  local cross=()
  if [ "$arch" != "$HOST" ]; then
    command -v nasm >/dev/null || { echo "nasm ontbreekt voor x86_64 (brew install nasm)" >&2; exit 1; }
    cross=(--enable-cross-compile --target-os=darwin --cc="clang -arch $arch")
  fi
  echo "• Configureren ($arch)"
  # --disable-gpl/--disable-nonfree: geen libx264/libx265/fdk-aac. --disable-autodetect: niets uit Homebrew meelinken.
  # --enable-shared + @rpath: de bibliotheken zijn losse bestanden naast het programma (vervangbaar, vereiste van de LGPL).
  (cd "$src" && ./configure --prefix="$prefix" --arch="$arch" ${cross[@]+"${cross[@]}"} \
    --disable-gpl --disable-nonfree --disable-autodetect \
    --enable-shared --disable-static --enable-pic \
    --disable-doc --disable-debug --disable-ffplay \
    --enable-videotoolbox --enable-zlib --enable-iconv --extra-libs=-liconv \
    --install-name-dir=@rpath \
    --extra-ldflags="-arch $arch -Wl,-rpath,@executable_path/lib" --extra-cflags="-arch $arch" >"$WORK/configure-$arch.log" 2>&1) \
    || { tail -30 "$WORK/configure-$arch.log" >&2; exit 1; }
  echo "• Bouwen ($arch, $(sysctl -n hw.ncpu) kernen)"
  (cd "$src" && make -j"$(sysctl -n hw.ncpu)" >"$WORK/make-$arch.log" 2>&1 && make install >>"$WORK/make-$arch.log" 2>&1) \
    || { tail -30 "$WORK/make-$arch.log" >&2; exit 1; }
}

collect() {  # collect <install-dir> <doel>: programma's plus de bibliotheken met alleen het hoofdversienummer in de naam
  local from="$1" to="$2"
  mkdir -p "$to/lib"
  cp "$from/bin/ffmpeg" "$from/bin/ffprobe" "$to/"
  for lib in "$from"/lib/lib*.dylib; do
    if [[ "$(basename "$lib")" =~ ^lib[a-z]+\.[0-9]+\.dylib$ ]]; then cp -L "$lib" "$to/lib/"; fi
  done
}

rm -rf "$OUT/lib" "$OUT/ffmpeg" "$OUT/ffprobe"
mkdir -p "$OUT"
if [ "$ARCH" = universal ]; then
  build_arch arm64; build_arch x86_64
  collect "$WORK/install-arm64" "$WORK/collect-arm64"; collect "$WORK/install-x86_64" "$WORK/collect-x86_64"
  mkdir -p "$OUT/lib"
  for f in ffmpeg ffprobe; do lipo -create "$WORK/collect-arm64/$f" "$WORK/collect-x86_64/$f" -output "$OUT/$f"; done
  for f in "$WORK"/collect-arm64/lib/*.dylib; do lipo -create "$f" "$WORK/collect-x86_64/lib/$(basename "$f")" -output "$OUT/lib/$(basename "$f")"; done
  else
  build_arch "$ARCH"
  collect "$WORK/install-$ARCH" "$OUT"
fi
chmod 755 "$OUT/ffmpeg" "$OUT/ffprobe"
strip -x "$OUT/ffmpeg" "$OUT/ffprobe" "$OUT"/lib/*.dylib 2>/dev/null || true

# Licenties, bronnen en herbouwinformatie: onderdeel van het pakket (LGPL §6).
mkdir -p "$LICENSES"
cp "$TARBALL" "$LICENSES/"
cp "$APP/scripts/build-ffmpeg-lgpl.sh" "$LICENSES/"
tar -xJOf "$TARBALL" "ffmpeg-$VERSION/COPYING.LGPLv2.1" > "$LICENSES/COPYING.LGPLv2.1"
tar -xJOf "$TARBALL" "ffmpeg-$VERSION/LICENSE.md" > "$LICENSES/LICENSE.md"
"$OUT/ffmpeg" -version 2>/dev/null | sed -n '1p;/^configuration:/p' > "$LICENSES/BUILD-INFO.txt" || true
cat > "$LICENSES/NOTICE.txt" <<NOTICE
Deze app gebruikt FFmpeg $VERSION (https://ffmpeg.org), uitgegeven onder de GNU Lesser General Public License v2.1 of later.
FFmpeg is een handelsmerk van Fabrice Bellard, oorspronkelijk auteur van het FFmpeg-project.

De bibliotheken staan als losse bestanden in Resources/bin/lib en kunnen worden vervangen door een eigen build
van dezelfde FFmpeg-versie. De volledige broncode (ffmpeg-$VERSION.tar.xz) en het buildscript (build-ffmpeg-lgpl.sh)
met de gebruikte configuratie (BUILD-INFO.txt) staan in deze map. Er zijn geen wijzigingen aan de broncode gemaakt.
De licentietekst staat in COPYING.LGPLv2.1.
NOTICE
echo "✓ Klaar: $OUT en $LICENSES"
echo "  Controleer met: node scripts/verify-ffmpeg-lgpl.mjs"
