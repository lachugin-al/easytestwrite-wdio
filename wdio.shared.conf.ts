import type { Options } from '@wdio/types';

const truthy = (v?: string) => /^(1|true|yes|on)$/i.test(String(v ?? ''));

// 1 - show low-level WebDriver steps (findElement, etc.)
const ALLURE_DEBUG_CMDS = truthy(process.env.ALLURE_DEBUG_CMDS);
// 1 - auto-screenshots on every WebDriver step (usually not desired;
// screenshots are handled by our custom step() helper)
const ALLURE_CMD_SHOTS = truthy(process.env.ALLURE_CMD_SHOTS);

/**
 * Shared WDIO config (platform-agnostic).
 * Platform-specific configs (Android/iOS) should spread this and extend capabilities/services.
 */
export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./tests/specs/**/*.ts'],
  exclude: [],
  maxInstances: 1,
  logLevel: 'info',
  bail: 0,
  baseUrl: '',
  waitforTimeout: 30000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: 'mocha',

  reporters: [
    'spec',
    [
      'allure',
      {
        outputDir: 'allure-results',

        // Disable "internal" WebDriver steps by default
        disableWebdriverStepsReporting: !ALLURE_DEBUG_CMDS,

        // Disable automatic screenshots by the reporter (we attach them via step())
        disableWebdriverScreenshotsReporting: !ALLURE_CMD_SHOTS,

        // Templates for clickable links, if needed:
        // issueLinkTemplate: 'https://jira.mycompany.com/browse/%s',
        // tmsLinkTemplate:   'https://tms.mycompany.com/cases/%s',

        // ← Populates the "Environment" panel in the Allure report
        reportedEnvironmentVars: {
          Platform: process.env.ANDROID_PLATFORM_VERSION
            ? `Android ${process.env.ANDROID_PLATFORM_VERSION}`
            : process.env.IOS_PLATFORM_VERSION
              ? `iOS ${process.env.IOS_PLATFORM_VERSION}`
              : '',
          Device: process.env.ANDROID_DEVICE_NAME || process.env.IOS_DEVICE_NAME || '',
          App:
            process.env.ANDROID_APP ||
            process.env.IOS_APP ||
            process.env.IOS_BUNDLE_ID ||
            process.env.ANDROID_APP_PACKAGE ||
            '',
          Emulator: process.env.ANDROID_EMULATOR_NAME || '',
          IOS_UDID: process.env.IOS_UDID || '',
        },
      },
    ],
  ],

  mochaOpts: {
    ui: 'bdd',
    timeout: 180000,
  },

  // Appium (via WDIO service)
  port: 4723,

  // Services are added in platform configs (android/ios)
  services: [],
};
