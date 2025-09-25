import allure from '@wdio/allure-reporter';
import { $, $$, expect, driver, browser } from '@wdio/globals';

import { PageElement } from '../core/locators/page-element.js';
import { step } from '../plugins/reporting/allure/steps.js';

// ---- TYPES ----

/** Swipe/scroll direction. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** A convenient selector union accepted by helpers. */
type SelectorLike = string | PageElement | { text?: string; name?: string; id?: string };

/** Screen-space point in pixels. */
type Point = { x: number; y: number };

/** Android network throttling profiles (emulator commands). */
type NetworkProfile = 'offline' | '2g' | '3g' | '4g' | 'lte' | 'full';

/** Biometric modality. */
type BiometricType = 'face' | 'touch' | 'fingerprint';

/** Webview/native context descriptor (loose). */
type AnyContext = string | { id?: string; name?: string; title?: string; url?: string };

type AnyEl = ReturnType<typeof $>;

const TAP_PAUSE_MS = 80;

// ---- SELECTOR/EL HELPERS ----

/**
 * Resolve a {@link SelectorLike} into a WDIO string selector.
 * Supports:
 *  - string (returned as-is)
 *  - PageElement (uses {@link PageElement.toSelector})
 *  - object with text/name/id (builds XPath/accessibility id fallback)
 */
function resolveSelector(sel: SelectorLike): string {
  if (typeof sel === 'string') return sel;
  if (sel instanceof PageElement) return sel.toSelector();
  if (sel.text)
    return `//*[@text="${sel.text}"]|//*[@name="${sel.text}"]|//*[@label="${sel.text}"]|~${sel.text}`;
  if (sel.name) return `//*[@name="${sel.name}"]|~${sel.name}`;
  if (sel.id) return `~${sel.id}`;
  throw new Error('Unsupported selector: ' + JSON.stringify(sel));
}

/**
 * Find element(s) by selector and return the requested instance (1-based index via `elementNumber`).
 * Waits for existence before returning.
 */
async function resolveElements(
  selector: SelectorLike,
  opts: { elementNumber?: number; timeout?: number } = {},
): Promise<AnyEl> {
  const { elementNumber, timeout = 30000 } = opts;
  const s = resolveSelector(selector);
  const first = $(s); // chainable
  await first.waitForExist({ timeout });
  const list = await $$(s);
  const idx = typeof elementNumber === 'number' ? Math.max(0, elementNumber - 1) : 0;
  const el = list[idx] || first;
  return el;
}

/** Compute the visual center of an element. */
async function elementCenter(el: AnyEl): Promise<Point> {
  const [loc, size] = await Promise.all([el.getLocation(), el.getSize()]);
  return { x: Math.round(loc.x + size.width / 2), y: Math.round(loc.y + size.height / 2) };
}

/* ---------------- BASIC ACTIONS ---------------- */

/**
 * Click an element resolved by selector. Waits until displayed.
 */
export async function click(
  selector: SelectorLike,
  opts: { elementNumber?: number; timeout?: number } = {},
) {
  const { elementNumber, timeout = 30000 } = opts;
  const el = await resolveElements(selector, { elementNumber, timeout });
  await el.waitForDisplayed({ timeout });
  await el.click();
}

/**
 * Tap on a point or the center of a resolved element using W3C actions.
 */
export async function tap(where: SelectorLike | Point, opts: { timeout?: number } = {}) {
  const { timeout = 30000 } = opts;
  const p =
    typeof (where as any).x === 'number'
      ? (where as Point)
      : await elementCenter(await resolveElements(where as SelectorLike, { timeout }));

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: p.x, y: p.y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: TAP_PAUSE_MS },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Double tap on a point or element.
 * Uses native `mobile: tap` on iOS; emulates with two taps on Android.
 */
export async function doubleTap(where: SelectorLike | Point, opts: { timeout?: number } = {}) {
  const { timeout = 30000 } = opts;
  if (driver.isIOS) {
    if (typeof (where as any).x === 'number') {
      const p = where as Point;
      await driver.execute('mobile: tap', { x: p.x, y: p.y, tapCount: 2 });
    } else {
      const el = await resolveElements(where as SelectorLike, { timeout });
      await driver.execute('mobile: tap', { elementId: el.elementId, tapCount: 2 });
    }
  } else {
    const p =
      typeof (where as any).x === 'number'
        ? (where as Point)
        : await elementCenter(await resolveElements(where as SelectorLike, { timeout }));
    await tap(p);
    await tap(p);
  }
}

/**
 * Long-press on a point or element center for the given duration.
 */
export async function longPress(
  where: SelectorLike | Point,
  durationMs = 800,
  opts: { timeout?: number } = {},
) {
  const { timeout = 30000 } = opts;
  const p =
    typeof (where as any).x === 'number'
      ? (where as Point)
      : await elementCenter(await resolveElements(where as SelectorLike, { timeout }));
  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: p.x, y: p.y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: durationMs },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Type text into an input resolved by selector.
 * Optionally clears first and/or presses Enter to submit.
 */
export async function typeText(
  selector: SelectorLike,
  text: string,
  opts: {
    clearFirst?: boolean;
    submit?: boolean;
    timeout?: number;
  } = {},
) {
  const { clearFirst = false, submit = false, timeout = 30000 } = opts;
  const el = await resolveElements(selector, { timeout });
  await el.waitForDisplayed({ timeout });
  if (clearFirst) await el.clearValue();
  await el.click();
  await el.addValue(text);
  if (submit) await driver.keys(['Enter']);
}

/** Clear text value of an input-like element. */
export async function clearText(selector: SelectorLike, opts: { timeout?: number } = {}) {
  const el = await resolveElements(selector, { timeout: opts.timeout ?? 30000 });
  await el.clearValue();
}

/** Attempt to hide the on-screen keyboard (Android/iOS). */
export async function hideKeyboard() {
  try {
    if (driver.isAndroid) await driver.hideKeyboard();
    else await driver.execute('mobile: hideKeyboard');
  } catch {
    /* ignore */
  }
}

/** Assert that element is visible (displayed). */
export async function checkVisible(selector: SelectorLike, opts: { timeout?: number } = {}) {
  const { timeout = 30000 } = opts;
  const el = await resolveElements(selector, { timeout });
  await el.waitForDisplayed({ timeout });
  await expect(el).toBeDisplayed();
}

/** Assert that element is not visible (reverse wait). */
export async function checkNotVisible(selector: SelectorLike, opts: { timeout?: number } = {}) {
  const { timeout = 30000 } = opts;
  const s = resolveSelector(selector);
  const el = await $(s);
  await el.waitForDisplayed({ timeout, reverse: true });
  await expect(el).not.toBeDisplayed();
}

/** Get text content from an element. */
export async function getText(selector: SelectorLike): Promise<string> {
  const el = await resolveElements(selector, { timeout: 30000 });
  await el.waitForDisplayed({ timeout: 30000 });
  return el.getText();
}

/**
 * Assert text equals/contains the expected value.
 */
export async function checkText(
  selector: SelectorLike,
  text: string,
  opts: {
    contains?: boolean;
    timeout?: number;
  } = {},
) {
  const { contains = false, timeout = 30000 } = opts;
  const actual = await (await resolveElements(selector, { timeout })).getText();
  if (contains) await expect(actual).toContain(text);
  else await expect(actual).toEqual(text);
}

/* ---------------- SCROLL & SWIPE ---------------- */

/**
 * Scroll the screen in a given direction N times.
 * Android uses `mobile: scrollGesture` within a central region; iOS uses `mobile: swipe`.
 */
export async function scroll(direction: Direction, count = 1) {
  for (let i = 0; i < count; i++) {
    if (driver.isAndroid) {
      const { width, height } = await driver.getWindowRect();
      const left = Math.floor(width * 0.1);
      const top = Math.floor(height * 0.2);
      const region = {
        left,
        top,
        width: Math.floor(width * 0.8),
        height: Math.floor(height * 0.6),
      };
      await driver.execute('mobile: scrollGesture', { ...region, direction, percent: 0.85 });
    } else {
      await driver.execute('mobile: swipe', { direction });
    }
    await browser.pause(200);
  }
}

export const scrollDown = (count = 1) => scroll('down', count);
export const scrollUp = (count = 1) => scroll('up', count);
export const scrollLeft = (count = 1) => scroll('left', count);
export const scrollRight = (count = 1) => scroll('right', count);

/**
 * Swipe inside an element's bounds in the given direction.
 */
export async function swipeOnElement(
  selector: SelectorLike,
  direction: Direction,
  percent = 0.8,
  opts: {
    timeout?: number;
  } = {},
) {
  const el = await resolveElements(selector, { timeout: opts.timeout ?? 30000 });
  if (driver.isAndroid) {
    const [loc, size] = await Promise.all([el.getLocation(), el.getSize()]);
    await driver.execute('mobile: swipeGesture', {
      left: loc.x,
      top: loc.y,
      width: size.width,
      height: size.height,
      direction,
      percent,
    });
  } else {
    await driver.execute('mobile: swipe', { elementId: el.elementId, direction });
  }
}

/**
 * Scroll until element becomes visible (or fails after max swipes).
 */
export async function scrollIntoView(
  selector: SelectorLike,
  opts: {
    direction?: Direction;
    maxSwipes?: number;
    pauseMs?: number;
  } = {},
) {
  const { direction = 'down', maxSwipes = 10, pauseMs = 250 } = opts;
  const s = resolveSelector(selector);
  for (let i = 0; i < maxSwipes; i++) {
    const el = await $(s);
    if (await el.isDisplayed().catch(() => false)) return;
    await scroll(direction, 1);
    await browser.pause(pauseMs);
  }
  await (await $(s)).waitForDisplayed({ timeout: 2000 }).catch(() => {
    throw new Error(`Element ${s} not visible after ${maxSwipes} scrolls`);
  });
}

/**
 * Android-only helper to scroll a scrollable container until given text is in view.
 * Note: the underlying call triggers a click; we ignore the result.
 */
export async function androidScrollToText(text: string) {
  if (!driver.isAndroid) return;
  const sel = `android=new UiScrollable(new UiSelector().scrollable(true)).scrollTextIntoView("${text}")`;
  await $(sel)
    .click()
    .catch(() => {}); // the call performs the scroll
}

/* ---------------- DRAG & DROP ---------------- */

/**
 * Drag from the center of one element to the center of another element or a point.
 */
export async function dragAndDrop(
  from: SelectorLike,
  to: SelectorLike | Point,
  opts: { timeout?: number } = {},
) {
  const source = await resolveElements(from, { timeout: opts.timeout ?? 30000 });
  const start = await elementCenter(source);
  const end =
    typeof (to as any).x === 'number'
      ? (to as Point)
      : await elementCenter(
          await resolveElements(to as SelectorLike, { timeout: opts.timeout ?? 30000 }),
        );

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: start.x, y: start.y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 150 },
        { type: 'pointerMove', duration: 500, x: end.x, y: end.y },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/* ---------------- ALERTS & CONTEXTS ---------------- */

/** Accept an alert, with a short retry after pause if the first attempt fails. */
export async function acceptAlert(timeout = 5000) {
  try {
    await driver.acceptAlert();
  } catch {
    await browser.pause(timeout);
    try {
      await driver.acceptAlert();
    } catch {}
  }
}

/** Dismiss an alert, with a short retry after pause if the first attempt fails. */
export async function dismissAlert(timeout = 5000) {
  try {
    await driver.dismissAlert();
  } catch {
    await browser.pause(timeout);
    try {
      await driver.dismissAlert();
    } catch {}
  }
}

/** Safely get alert text; returns `undefined` if not available. */
export async function getAlertTextSafe(): Promise<string | undefined> {
  try {
    return await driver.getAlertText();
  } catch {
    return undefined;
  }
}

/** Normalize a context descriptor into id/label pair. */
function normalizeContext(c: AnyContext) {
  const id = typeof c === 'string' ? c : c.id || '';
  const label =
    typeof c === 'string' ? c : [c.name, c.title, c.url, id].filter(Boolean).join(' | ');
  return { id: id || label, label };
}

/**
 * Switch to a WEBVIEW context.
 * Optionally accepts a matcher function to pick a specific webview by name/label.
 * Throws if no webview context is found.
 */
export async function switchToWebview(matcher?: (name: string) => boolean) {
  const raw = await (driver as any).getContexts(); // string[] | DetailedContext[]
  const items = (raw as AnyContext[]).map(normalizeContext);

  const isWebview = (s: string) => s.startsWith('WEBVIEW') || s.includes('WEBVIEW');

  const target = items.find(
    (ctx) =>
      (isWebview(ctx.id) || isWebview(ctx.label)) &&
      (matcher ? matcher(ctx.id) || matcher(ctx.label) : true),
  );

  if (!target) {
    throw new Error(`No WEBVIEW context found. Contexts: ${items.map((i) => i.label).join(', ')}`);
  }
  await driver.switchContext(target.id);
}

/** Switch back to the native context. */
export async function switchToNative() {
  await driver.switchContext('NATIVE_APP');
}

/* ---------------- APP / DEVICE ---------------- */

/**
 * Navigate back. On iOS there is no universal 'back'-fallback is pressing Home.
 */
export async function back() {
  if (driver.isAndroid) await driver.back();
  else await driver.execute('mobile: pressButton', { name: 'home' }); // often Home is desired on iOS
}

/** Go to device home screen. */
export async function home() {
  if (driver.isAndroid)
    await driver
      .execute('mobile: shell', {
        command: 'input',
        args: ['keyevent', '3'],
      })
      .catch(() => {});
  else await driver.execute('mobile: pressButton', { name: 'home' });
}

/** Send the app to background for N seconds. */
export async function background(seconds = 3) {
  await driver.background(seconds);
}

/** Activate an app by id (package/bundle). */
export async function activateApp(appId: string) {
  await driver.activateApp(appId);
}

/** Terminate an app by id (package/bundle). */
export async function terminateApp(appId: string) {
  await driver.terminateApp(appId);
}

/** Set device orientation. */
export async function setOrientation(orientation: 'LANDSCAPE' | 'PORTRAIT') {
  await driver.setOrientation(orientation);
}

/* ---------------- iOS PICKERS / SLIDERS ---------------- */

/**
 * iOS: advance a picker wheel forward N times.
 */
export async function iosPickerWheelNext(selector: SelectorLike, times = 1) {
  if (!driver.isIOS) return;
  const el = await resolveElements(selector, { timeout: 10000 });
  for (let i = 0; i < times; i++) {
    await driver.execute('mobile: selectPickerWheelValue', {
      elementId: el.elementId,
      order: 'next',
      offset: 0.15,
    });
  }
}

/**
 * iOS: move a picker wheel backward N times.
 */
export async function iosPickerWheelPrev(selector: SelectorLike, times = 1) {
  if (!driver.isIOS) return;
  const el = await resolveElements(selector, { timeout: 10000 });
  for (let i = 0; i < times; i++) {
    await driver.execute('mobile: selectPickerWheelValue', {
      elementId: el.elementId,
      order: 'previous',
      offset: 0.15,
    });
  }
}

/**
 * Set a slider value.
 * - iOS: send a 0..1 value with addValue().
 * - Android: drag handle proportionally using pointer actions.
 */
export async function setSliderValue(
  selector: SelectorLike,
  value01: number,
  opts: { timeout?: number } = {},
) {
  const el = await resolveElements(selector, { timeout: opts.timeout ?? 10000 });
  if (driver.isIOS) {
    await el.addValue(String(value01)); // iOS slider accepts 0..1
  } else {
    const [loc, size] = await Promise.all([el.getLocation(), el.getSize()]);
    const y = Math.round(loc.y + size.height / 2);
    const x0 = loc.x + 2;
    const x1 = Math.round(loc.x + size.width * Math.max(0, Math.min(1, value01)));
    await driver.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: x0, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', duration: 400, x: x1, y },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await driver.releaseActions();
  }
}

/* ---------------- CLIPBOARD / GEO / FILES ---------------- */

/** Set clipboard text. */
export async function setClipboard(text: string) {
  await driver.setClipboard(text);
}

/** Get clipboard text. */
export async function getClipboard(): Promise<string> {
  return driver.getClipboard();
}

/** Set geolocation (latitude, longitude, altitude in meters). */
export async function setGeo(lat: number, lon: number, alt = 10) {
  await driver.setGeoLocation({ latitude: lat, longitude: lon, altitude: alt });
}

/** Push a base64-encoded file to the device. */
export async function pushFile(remotePath: string, base64: string) {
  await driver.pushFile(remotePath, base64);
}

/** Pull a file from the device as base64. */
export async function pullFile(remotePath: string): Promise<string> {
  return driver.pullFile(remotePath);
}

/* ---------------- WAITS ---------------- */

/** Wait until an element stops existing in the DOM/accessibility tree. */
export async function waitForGone(selector: SelectorLike, timeout = 10000) {
  const el = await $(resolveSelector(selector));
  await el.waitForExist({ timeout, reverse: true });
}

/**
 * Wait until element text matches the expectation.
 * By default, checks substring (`contains = true`).
 */
export async function waitForText(
  selector: SelectorLike,
  text: string,
  opts: {
    contains?: boolean;
    timeout?: number;
  } = {},
) {
  const { contains = true, timeout = 10000 } = opts;
  const s = resolveSelector(selector);
  await browser.waitUntil(
    async () => {
      const el = await $(s);
      const t = await el.getText().catch(() => '');
      return contains ? t.includes(text) : t === text;
    },
    { timeout, timeoutMsg: `Text "${text}" not found in ${s}` },
  );
}

/* ---------------- NOTIFICATIONS (Android) ---------------- */

/** Open the Android notification shade. */
export async function openNotifications() {
  if (driver.isAndroid) await driver.openNotifications();
}

/* ---------------- SCREENSHOT ---------------- */

/** Take a screenshot and attach it to Allure as PNG. */
export async function screenshot(name = 'screenshot') {
  const png = await browser.takeScreenshot();
  allure.addAttachment(name, Buffer.from(png, 'base64'), 'image/png');
}

/* ======================== NEW: DEEP LINKS ======================== */

/**
 * Open a deep link in the target app.
 * - Android: tries `mobile: deepLink`, falls back to `am start -a VIEW -d <url> [<pkg>]`
 * - iOS: tries `mobile: deepLink`, falls back to `activateApp(bundleId)`
 */
export async function openDeepLink(url: string, appId?: string) {
  if (driver.isAndroid) {
    const pkg = appId || (process.env.ANDROID_APP_PACKAGE ?? undefined);
    try {
      await driver.execute('mobile: deepLink', { url, package: pkg });
    } catch {
      const args = ['start', '-W', '-a', 'android.intent.action.VIEW', '-d', url];
      if (pkg) args.push(pkg);
      await driver.execute('mobile: shell', { command: 'am', args }).catch(() => {});
    }
  } else {
    const bundleId = appId || (process.env.IOS_BUNDLE_ID ?? undefined);
    try {
      await driver.execute('mobile: deepLink', { url, bundleId });
    } catch {
      if (bundleId) await driver.activateApp(bundleId).catch(() => {});
    }
  }
}

/* ======================== NEW: PERMISSIONS ======================== */

/** Android: grant multiple app permissions via `pm grant`. */
export async function androidGrantPermissions(packageId: string, permissions: string[]) {
  for (const p of permissions) {
    await driver
      .execute('mobile: shell', { command: 'pm', args: ['grant', packageId, p] })
      .catch(() => {});
  }
}

/** Android: revoke multiple app permissions via `pm revoke`. */
export async function androidRevokePermissions(packageId: string, permissions: string[]) {
  for (const p of permissions) {
    await driver
      .execute('mobile: shell', { command: 'pm', args: ['revoke', packageId, p] })
      .catch(() => {});
  }
}

/** Android: open the app's system settings screen. */
export async function androidOpenAppSettings(packageId: string) {
  await driver.execute('mobile: shell', {
    command: 'am',
    args: [
      'start',
      '-a',
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      '-d',
      `package:${packageId}`,
    ],
  });
}

/**
 * iOS Simulator: grant privacy-controlled services via `xcrun simctl privacy`.
 * Requires `IOS_UDID` environment variable.
 */
export async function iosGrantPermissions(bundleId: string, services: string[]) {
  if (!driver.isIOS) return;
  const udid = process.env.IOS_UDID;
  if (!udid) throw new Error('iosGrantPermissions: IOS_UDID is required for Simulator.');
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(exec);
  for (const s of services)
    await run(`xcrun simctl privacy ${udid} grant ${s} ${bundleId}`).catch(() => {});
}

/**
 * iOS Simulator: revoke privacy-controlled services via `xcrun simctl privacy`.
 * Requires `IOS_UDID` environment variable.
 */
export async function iosRevokePermissions(bundleId: string, services: string[]) {
  if (!driver.isIOS) return;
  const udid = process.env.IOS_UDID;
  if (!udid) throw new Error('iosRevokePermissions: IOS_UDID is required for Simulator.');
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(exec);
  for (const s of services)
    await run(`xcrun simctl privacy ${udid} revoke ${s} ${bundleId}`).catch(() => {});
}

/* ======================== UNIQUE: NETWORK PROFILES (Android) ======================== */

/**
 * Emulate network profiles on Android emulators via shell commands.
 * Note: requires emulator support for `cmd network speed`, etc.
 */
export async function setNetworkProfile(profile: NetworkProfile) {
  if (!driver.isAndroid) return;
  switch (profile) {
    case 'offline':
      await driver
        .execute('mobile: shell', { command: 'svc', args: ['wifi', 'disable'] })
        .catch(() => {});
      await driver
        .execute('mobile: shell', { command: 'svc', args: ['data', 'disable'] })
        .catch(() => {});
      break;
    case '2g':
      await driver
        .execute('mobile: shell', { command: 'cmd', args: ['network', 'speed', 'edge'] })
        .catch(() => {});
      break;
    case '3g':
      await driver
        .execute('mobile: shell', { command: 'cmd', args: ['network', 'speed', 'umts'] })
        .catch(() => {});
      break;
    case '4g':
    case 'lte':
      await driver
        .execute('mobile: shell', { command: 'cmd', args: ['network', 'speed', 'lte'] })
        .catch(() => {});
      break;
    case 'full':
      await driver
        .execute('mobile: shell', { command: 'cmd', args: ['network', 'speed', 'full'] })
        .catch(() => {});
      await driver
        .execute('mobile: shell', { command: 'svc', args: ['wifi', 'enable'] })
        .catch(() => {});
      await driver
        .execute('mobile: shell', { command: 'svc', args: ['data', 'enable'] })
        .catch(() => {});
      break;
  }
}

/* ======================== UNIQUE: BIOMETRICS & SHAKE ======================== */

/**
 * Simulate a biometric event.
 * - Android: fingerprint/touch via `fingerPrint` or `mobile: fingerprint`
 * - iOS: Face ID / Touch ID via `mobile: sendBiometricMatch`
 */
export async function biometric(type: BiometricType, match: boolean) {
  if (driver.isAndroid) {
    if (type === 'fingerprint' || type === 'touch') {
      try {
        await (driver as any).fingerPrint?.(1);
      } catch {
        // legacy alias
        await driver.execute('mobile: fingerprint', { fingerprintId: 1 }).catch(() => {});
      }
    }
  } else {
    const kind = type === 'face' ? 'faceId' : 'touchId';
    await driver.execute('mobile: sendBiometricMatch', { type: kind, match }).catch(() => {});
  }
}

/** iOS: trigger a device shake gesture (best-effort). */
export async function shake() {
  if (!driver.isIOS) return;
  try {
    // preferred path if method exists
    await (driver as any).shake();
  } catch {
    // fallback via mobile: shake
    try {
      await driver.execute('mobile: shake');
    } catch {
      /* ignore */
    }
  }
}

/* ======================== UNIQUE: SMART TAP ======================== */

/**
 * Scroll element into view and attempt to click it with optional retries.
 */
export async function smartTap(
  selector: SelectorLike,
  opts: {
    maxScrolls?: number;
    direction?: Direction;
    retries?: number;
  } = {},
) {
  const { maxScrolls = 8, direction = 'down', retries = 2 } = opts;
  await scrollIntoView(selector, { maxSwipes: maxScrolls, direction });
  for (let i = 0; i <= retries; i++) {
    try {
      await click(selector);
      return;
    } catch (e) {
      if (i === retries) throw e;
      await browser.pause(200);
    }
  }
}

/* ======================== UNIQUE: UI DUMP & THEME & RECORDING & LOGS ======================== */

/**
 * Attach current UI hierarchy (XML) to Allure.
 */
export async function attachUiHierarchy(name = 'ui.xml') {
  try {
    const xml = await driver.getPageSource();
    allure.addAttachment(name, xml, 'application/xml');
  } catch {}
}

/**
 * Toggle device dark mode.
 * - Android: `cmd uimode night yes/no`
 * - iOS: `mobile: setAppearance` (fallback to `simctl ui <udid> appearance`)
 */
export async function setDarkMode(enabled: boolean) {
  if (driver.isAndroid) {
    await driver
      .execute('mobile: shell', {
        command: 'cmd',
        args: ['uimode', 'night', enabled ? 'yes' : 'no'],
      })
      .catch(() => {});
  } else {
    // XCUITest supports mobile: setAppearance on Simulator
    try {
      await driver.execute('mobile: setAppearance', { style: enabled ? 'dark' : 'light' });
    } catch {
      // fallback via simctl (requires IOS_UDID)
      const udid = process.env.IOS_UDID;
      if (udid) {
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const run = promisify(exec);
        await run(`xcrun simctl ui ${udid} appearance ${enabled ? 'dark' : 'light'}`).catch(
          () => {},
        );
      }
    }
  }
}

/** Start screen recording (best-effort). */
export async function startRecordingScreen() {
  try {
    await driver.startRecordingScreen();
  } catch {}
}

/** Stop screen recording and attach MP4 to Allure. */
export async function stopRecordingScreen(name = 'screenrecord.mp4') {
  try {
    const b64 = await driver.stopRecordingScreen();
    if (b64) allure.addAttachment(name, Buffer.from(b64, 'base64'), 'video/mp4');
  } catch {}
}

/**
 * Collect device logs and attach as text:
 * - Android: logcat
 * - iOS: syslog
 */
export async function attachDeviceLogs() {
  try {
    if (driver.isAndroid) {
      const logs = (await (driver as any).getLogs('logcat')) as Array<{
        timestamp: number;
        message: string;
      }>;
      const text = logs
        .map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.message}`)
        .join('\n');
      allure.addAttachment('logcat.txt', text, 'text/plain');
    } else {
      const logs = (await (driver as any).getLogs('syslog')) as Array<{
        timestamp: number;
        message: string;
      }>;
      const text = logs
        .map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.message}`)
        .join('\n');
      allure.addAttachment('syslog.txt', text, 'text/plain');
    }
  } catch {}
}

/* ---------------- EXPORT GROUP ---------------- */

/**
 * Convenience export: grouped actions + step helper.
 * Allows usage like:
 *
 *   import { actions } from '.../mobile-actions';
 *   await actions.click('~Login');
 *   await actions.step('Do something', async () => { ... });
 */
export const actions = {
  // base
  click,
  tap,
  doubleTap,
  longPress,
  typeText,
  clearText,
  hideKeyboard,
  checkVisible,
  checkNotVisible,
  getText,
  checkText,
  // scrolls
  scroll,
  scrollUp,
  scrollDown,
  scrollLeft,
  scrollRight,
  swipeOnElement,
  scrollIntoView,
  androidScrollToText,
  // dnd
  dragAndDrop,
  // alerts/ctx
  acceptAlert,
  dismissAlert,
  getAlertTextSafe,
  switchToWebview,
  switchToNative,
  // app/device
  back,
  home,
  background,
  activateApp,
  terminateApp,
  setOrientation,
  // ios widgets
  iosPickerWheelNext,
  iosPickerWheelPrev,
  setSliderValue,
  // clipboard/geo/files
  setClipboard,
  getClipboard,
  setGeo,
  pushFile,
  pullFile,
  // waits/notifications
  waitForGone,
  waitForText,
  openNotifications,
  // screenshots
  screenshot,
  // deep links & perms
  openDeepLink,
  androidGrantPermissions,
  androidRevokePermissions,
  androidOpenAppSettings,
  iosGrantPermissions,
  iosRevokePermissions,
  // unique
  setNetworkProfile,
  biometric,
  shake,
  smartTap,
  attachUiHierarchy,
  setDarkMode,
  startRecordingScreen,
  stopRecordingScreen,
  attachDeviceLogs,
  // and your step (re-export is handy next to actions)
  step,
};
