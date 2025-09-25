import { boolFrom, numFrom, jsonFrom, envStr } from './src/utils/env.js';
import { config as shared } from './wdio.shared.conf.js';

// Dynamic import of our custom DeviceLauncherService
const { default: DeviceLauncherService } = await import(
  './src/services/device-launcher.service.js'
);

// Whether Appium should auto-launch the app (can be disabled for already running apps)
const autoLaunch = boolFrom(process.env.APPIUM_AUTO_LAUNCH, true);

// Optional process args/env passed to the AUT (XCUITest capability)
const processArgs = jsonFrom<string[]>(process.env.IOS_PROCESS_ARGS, []);
const processEnv = jsonFrom<Record<string, string>>(process.env.IOS_PROCESS_ENV, {});

/**
 * WDIO configuration for iOS + Appium v3.
 *
 * Reads most parameters from environment variables for CI flexibility.
 * Extends the shared config with iOS-specific capabilities
 * and attaches DeviceLauncherService to auto-start Simulator if needed.
 */
export const config: WebdriverIO.Config = {
  ...shared,

  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',

      // App under test / bundle
      'appium:app': envStr('IOS_APP'),
      'appium:bundleId': envStr('IOS_BUNDLE_ID'),

      // Device / simulator
      'appium:platformVersion': envStr('IOS_PLATFORM_VERSION'),
      'appium:deviceName': envStr('IOS_DEVICE_NAME'),

      // Session behavior / UX helpers
      'appium:connectHardwareKeyboard': boolFrom(process.env.IOS_CONNECT_HARDWARE_KEYBOARD, false),
      'appium:autoAcceptAlerts': boolFrom(process.env.IOS_AUTO_ACCEPT_ALERTS, false),
      'appium:autoDismissAlerts': boolFrom(process.env.IOS_AUTO_DISMISS_ALERTS, false),
      'appium:showIOSLog': boolFrom(process.env.IOS_SHOW_IOS_LOG, false),

      // App lifecycle
      'appium:autoLaunch': autoLaunch,

      // Process-level arguments & environment for the AUT
      'appium:processArguments': { args: processArgs, env: processEnv },

      // Optional WDA setting (exposed via dynamic cap for convenience)
      ...(process.env.IOS_SETTINGS_CUSTOM_SNAPSHOT_TIMEOUT
        ? {
            'appium:settings[customSnapshotTimeout]': numFrom(
              process.env.IOS_SETTINGS_CUSTOM_SNAPSHOT_TIMEOUT,
              3,
            ),
          }
        : {}),
    },
  ],

  services: [
    [
      DeviceLauncherService,
      {
        platform: 'ios',
        ios: {
          // If UDID not provided, service can resolve by deviceName
          udid: envStr('IOS_UDID'),
          deviceName: envStr('IOS_DEVICE_NAME'),
          headless: boolFrom(process.env.IOS_HEADLESS, false),
          bootTimeoutMs: numFrom(process.env.IOS_BOOT_TIMEOUT_MS, 120000),
          // Default = false (don't shutdown Simulator after tests)
          killOnComplete: !boolFrom(process.env.IOS_KILL_ON_COMPLETE, true)
            ? true
            : process.env.IOS_KILL_ON_COMPLETE !== '0',
        },
        verbose: true, // Enable detailed logging from the launcher service
      },
    ],
    ['appium', {}],
  ],
};
