#!/usr/bin/env bash
# Release APK build tuned for size:
#   - one ABI per APK (arm64-v8a covers phones sold since ~2018; x86_64 for the
#     emulator) via the withAbiSplits config plugin
#   - R8 minify + resource shrinking (drops unused classes and fonts)
#   - compressed native libs (smaller download, extracted on install)
# Usage: scripts/build-apk.sh [abi]
set -euo pipefail
cd "$(dirname "$0")/.."

export AKU_ABI="${1:-arm64-v8a}"
VERSION="$(node -p "require('./package.json').version")"

npx expo prebuild -p android --clean --no-install
cd android
./gradlew clean assembleRelease \
  -PreactNativeArchitectures="$AKU_ABI" \
  -Pandroid.enableProguardInReleaseBuilds=true \
  -Pandroid.enableShrinkResourcesInReleaseBuilds=true \
  -Pexpo.useLegacyPackaging=true

APK="app/build/outputs/apk/release/app-${AKU_ABI}-release.apk"
[ -f "$APK" ] || APK="app/build/outputs/apk/release/app-release.apk"
cp "$APK" "../asistenku-${VERSION}-${AKU_ABI}.apk"
ls -lh "../asistenku-${VERSION}-${AKU_ABI}.apk"
