import { boolFrom, numFrom, envStr, envNum } from './src/utils/env.js';
import { config as shared } from './wdio.shared.conf.js';

// Dynamic import of our custom DeviceLauncherService
const { default: DeviceLauncherService } = await import(
  './src/services/device-launcher.service.js'
);

// Whether to auto-launch the app (can be disabled for already running apps)
const autoLaunch = boolFrom(process.env.APPIUM_AUTO_LAUNCH, true);

/**
 * WDIO configuration for Android + Appium v3.
 *
 * Reads most parameters from environment variables for CI flexibility.
 * Extends the shared config (wdio.shared.conf.js) with Android-specific capabilities
 * and attaches DeviceLauncherService to auto-start emulator if needed.
 */
export const config: WebdriverIO.Config = {
  ...shared,

  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      // App under test
      'appium:app': envStr('ANDROID_APP'),
      'appium:appPackage': envStr('ANDROID_APP_PACKAGE'),
      'appium:appActivity': envStr('ANDROID_APP_ACTIVITY'),
      // Device/emulator settings
      'appium:platformVersion': envStr('ANDROID_PLATFORM_VERSION'),
      'appium:deviceName': envStr('ANDROID_DEVICE_NAME'),
      // Session behavior
      'appium:noReset': boolFrom(process.env.ANDROID_NO_RESET, false),
      'appium:newCommandTimeout': numFrom(process.env.APPIUM_NEW_COMMAND_TIMEOUT, 100),
      'appium:dontStopAppOnReset': boolFrom(process.env.ANDROID_DONT_STOP_APP_ON_RESET, false),
      // Input & keyboard
      'appium:unicodeKeyboard': boolFrom(process.env.ANDROID_UNICODE_KEYBOARD, true),
      // Timeouts & permissions
      'appium:adbExecTimeout': numFrom(process.env.ANDROID_ADB_EXEC_TIMEOUT, 40_000),
      'appium:autoGrantPermissions': boolFrom(process.env.ANDROID_AUTO_GRANT_PERMISSIONS, true),
      // Whether Appium should launch the app automatically
      'appium:autoLaunch': autoLaunch,
    },
  ],

  services: [
    [
      DeviceLauncherService,
      {
        platform: 'android',
        android: {
          avdName: envStr('ANDROID_EMULATOR_NAME'),
          port: envNum('ANDROID_EMULATOR_PORT'),
          headless: boolFrom(process.env.ANDROID_HEADLESS, false),
          coldBoot: boolFrom(process.env.ANDROID_COLD_BOOT),
          noSnapshot: boolFrom(process.env.ANDROID_NO_SNAPSHOT),
          bootTimeoutMs: numFrom(process.env.ANDROID_BOOT_TIMEOUT_MS, 240000),
          // Default = true (kill emulator after tests)
          killOnComplete: !boolFrom(process.env.ANDROID_KILL_ON_COMPLETE, true)
            ? true
            : process.env.ANDROID_KILL_ON_COMPLETE !== '0',
        },
        verbose: true, // Enable detailed logging from the launcher service
      },
    ],
    ['appium', {}],
  ],
};
