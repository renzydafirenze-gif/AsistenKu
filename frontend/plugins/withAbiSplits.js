const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Prebuilt React Native AARs ship native libs for every ABI, so
 * `reactNativeArchitectures` alone cannot slim the APK. ABI splits do.
 * One architecture per APK: arm64-v8a for real phones, x86_64 for the emulator.
 * Set AKU_ABI at prebuild time to pick one.
 */
const MARKER = '// @aku-abi-splits';
const ABI = process.env.AKU_ABI || 'arm64-v8a';

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (result) => {
    if (result.modResults.contents.includes(MARKER)) return result;
    result.modResults.contents = result.modResults.contents.replace(
      /android \{/,
      `android {
    ${MARKER}
    splits {
        abi {
            enable true
            reset()
            include '${ABI}'
            universalApk false
        }
    }`,
    );
    return result;
  });
};
