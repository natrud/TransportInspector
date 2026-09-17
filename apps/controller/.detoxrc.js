/* eslint-disable */
/**
 * Detox config skeleton — RN/Expo bare e2e test infrastructure.
 *
 * Usage (потрібен Xcode/Android SDK):
 *   pnpm detox test --configuration android.emu.debug
 */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: { setupTimeout: 120_000 },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],
    },
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/TransportInspector.app',
      build:
        'xcodebuild -workspace ios/TransportInspector.xcworkspace -scheme TransportInspector -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
  },
  devices: {
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_5_API_34' } },
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
  },
  configurations: {
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
  },
};
