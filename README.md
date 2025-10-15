# Mobile Test Automation Demo - WebdriverIO v9 + Appium v3 (TypeScript)

This project is a complete mobile E2E test setup built with WebdriverIO v9 and Appium v3, written in TypeScript. It includes:

- Mocha test framework and expect-webdriverio assertions
- Allure reporting with custom metadata and step helpers (including template literal steps `s`...``)
- Cross‑platform mobile actions (clicks, scrolls, swipes, gestures, deep links, permissions, device controls)
- Optional device launcher service that can auto-start Android Emulator or iOS Simulator

## Requirements

- Node.js 18+ (tested with Node 20+). TODO: confirm the minimum supported Node version for WDIO v9/Appium v3 in this repo.
- Package manager: pnpm (lockfile present). npm or yarn should also work, but commands below assume pnpm.
- Appium 3 is installed and managed via the WDIO Appium service (no separate server process needed).
- Android (for Android tests):
  - Android SDK with adb and emulator on PATH
  - AVD created (e.g., Pixel_6_API_34)
- iOS (for iOS tests on macOS):
  - Xcode with iOS Simulator
  - xcrun simctl available on PATH

## Installation

```bash
pnpm install
# or: npm install / yarn install
```

## Quick start

- Prepare your .env from the provided example:
  ```bash
  cp .env.example .env
  # edit values to match your local SDKs and app under test
  ```
- Run tests:
  - Android: `pnpm wdio:android`
  - iOS (macOS): `pnpm wdio:ios`
  - Shared (no platform-specific services/caps): `pnpm wdio`
- View Allure report:
  - Serve: `pnpm allure:serve`
  - Generate static report: `pnpm allure:generate`

## Scripts

Defined in package.json:

- lint: ESLint over the repo - `pnpm lint`
- lint:fix: ESLint with autofix - `pnpm lint:fix`
- format: Prettier write - `pnpm format`
- format:check: Prettier check - `pnpm format:check`
- wdio:android: Run WDIO with Android config - `pnpm wdio:android`
- wdio:ios: Run WDIO with iOS config - `pnpm wdio:ios`
- wdio: Run WDIO with shared config (no platform caps) - `pnpm wdio`
- allure:serve: Start Allure UI for ./allure-results - `pnpm allure:serve`
- allure:generate: Build static report to ./allure-report - `pnpm allure:generate`

## Configuration and entry points

- Test runner configs:
  - wdio.shared.conf.ts: shared WDIO config (Mocha, Allure reporter, timeouts, etc.)
  - wdio.android.conf.ts: extends shared config with Android capabilities and services (Appium, DeviceLauncherService)
  - wdio.ios.conf.ts: extends shared config with iOS capabilities and services (Appium, DeviceLauncherService)
- Specs location: `./tests/specs/**/*.ts`
- TypeScript config: `tsconfig.json` (ES2022 modules, bundler resolution)

## Environment variables

A .env.example is provided. Most values are optional; set only what your platform run requires. The project reads env vars in configs, actions, and reporting.

Common:

- STEP_SCREENSHOT: always | onFail | off (default onFail)
- AUTO_EXPLAIN_FAILURE: 1/true to attach a diagnostics bundle on failed steps
- AUTO_EXPLAIN_INCLUDE_RAW: 1/true to include raw Android dumpsys excerpt in the bundle
- ALLURE_DEBUG_CMDS: 1/true to enable low-level WebDriver steps in Allure
- ALLURE_CMD_SHOTS: 1/true to auto-attach screenshots on WebDriver commands (usually off; steps handle screenshots)

Android caps/services:

- ANDROID_APP: path to .apk (or leave empty when using appPackage/appActivity only)
- ANDROID_APP_PACKAGE: app package id
- ANDROID_APP_ACTIVITY: main activity name
- ANDROID_PLATFORM_VERSION: Android version (e.g., 14)
- ANDROID_DEVICE_NAME: device name (e.g., emulator-5554)
- ANDROID_NO_RESET: 1/0
- ANDROID_DONT_STOP_APP_ON_RESET: 1/0
- ANDROID_UNICODE_KEYBOARD: 1/0 (default 1)
- ANDROID_ADB_EXEC_TIMEOUT: ms (default 40000)
- ANDROID_AUTO_GRANT_PERMISSIONS: 1/0 (default 1)
- APPIUM_NEW_COMMAND_TIMEOUT: seconds (default 100)
- APPIUM_AUTO_LAUNCH: 1/0 (auto-start app)

Android device launcher service:

- ANDROID_EMULATOR_NAME: AVD name to boot
- ANDROID_EMULATOR_PORT: TCP port (e.g., 5554)
- ANDROID_HEADLESS: 1/0
- ANDROID_COLD_BOOT: 1/0 (force -no-snapshot-load)
- ANDROID_NO_SNAPSHOT: 1/0 (use -no-snapshot)
- ANDROID_BOOT_TIMEOUT_MS: ms (default 240000)
- ANDROID_KILL_ON_COMPLETE: 1/0 (kill emulator after run; default true)
- ANDROID_EMULATOR_RETRIES: int (default 2)
- ANDROID_HEALTHCHECK_RETRIES: int (default 3)
- ANDROID_HEALTHCHECK_INTERVAL_MS: ms (default 1500)
- ANDROID_COLD_RESTART_ON_FAIL: 1/0 (default 1)
- HEADLESS / CI: generic flags also respected

iOS caps/services (macOS):

- IOS_APP: path to .app/.ipa (optional if using bundleId)
- IOS_BUNDLE_ID: bundle id of the app under test
- IOS_PLATFORM_VERSION: iOS version (e.g., 18.5)
- IOS_DEVICE_NAME: Simulator name (e.g., iPhone 16 Plus)
- IOS_CONNECT_HARDWARE_KEYBOARD: 1/0
- IOS_AUTO_ACCEPT_ALERTS: 1/0
- IOS_AUTO_DISMISS_ALERTS: 1/0
- IOS_SHOW_IOS_LOG: 1/0
- IOS_PROCESS_ARGS: JSON array (e.g., ["--flag"]) passed to AUT
- IOS_PROCESS_ENV: JSON object of env for AUT
- IOS_SETTINGS_CUSTOM_SNAPSHOT_TIMEOUT: number (seconds) for WDA snapshot timeout
- APPIUM_AUTO_LAUNCH: 1/0 (auto-start app)
- IOS_UDID: explicit Simulator UDID (optional; service can resolve by name)
- IOS_HEADLESS: 1/0
- IOS_BOOT_TIMEOUT_MS: ms (default 120000)
- IOS_KILL_ON_COMPLETE: 1/0 (default 0)

## Tests

- Example spec: `tests/specs/example.allure.spec.ts` demonstrates Allure metadata, custom steps (step/s), and mobile actions.
- Assertions: expect-webdriverio; globals provided by @wdio/globals.
- To add tests, place `.ts` files under `tests/specs/` and run one of the WDIO scripts.

## Allure reporting

- The Allure reporter is configured in `wdio.shared.conf.ts` with reportedEnvironmentVars populated from env.
- You can set metadata inside tests via `setMeta()` and use step helpers `step()` and template `s`...`.
- Open report with `pnpm allure:serve` or generate static with `pnpm allure:generate`.

## Project structure

```
.
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── wdio.shared.conf.ts
├── wdio.android.conf.ts
├── wdio.ios.conf.ts
├── src/
│   ├── utils/env.ts
│   ├── runtime/
│   │   ├── mobile-actions.ts
│   │   └── diagnostics.ts
│   ├── services/
│   │   └── device-launcher.service.ts
│   └── plugins/reporting/allure/
│       ├── steps.ts
│       └── meta.ts
└── tests/
    └── specs/
        └── example.allure.spec.ts
```

## Troubleshooting

- Android emulator not starting:
  - Ensure ANDROID_EMULATOR_NAME matches an existing AVD (avdmanager / Android Studio)
  - Ensure adb/emulator are on PATH
- iOS simulator not starting (macOS):
  - Ensure Xcode and Command Line Tools are installed
  - If multiple Simulators exist, set IOS_UDID explicitly
- Allure report empty:
  - Check that tests produced files under ./allure-results
  - If you disabled screenshots via env, steps may still attach on failures

## License

This project is licensed under the MIT License - see the LICENSE file for details.