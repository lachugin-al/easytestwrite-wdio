import { exec as _exec, spawn } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const exec = promisify(_exec);

import { envFlag } from '../utils/env.js';

type AndroidOpts = {
  /** AVD name, e.g. "Pixel_6_API_34". If omitted, uses ANDROID_EMULATOR_NAME. */
  avdName?: string;
  /** Emulator TCP port, e.g. 5554. */
  port?: number;
  /** Run emulator without UI. */
  headless?: boolean;
  /** Force cold boot via -no-snapshot-load. */
  coldBoot?: boolean;
  /** Disable snapshots via -no-snapshot. */
  noSnapshot?: boolean;
  /** Boot timeout (ms). Default: 240_000. */
  bootTimeoutMs?: number;
  /** Kill emulator on WDIO onComplete. Default: true. */
  killOnComplete?: boolean;
};

type IOSOpts = {
  /** Explicit Simulator UDID. If absent, resolved by deviceName. */
  udid?: string;
  /** Simulator device name, e.g. "iPhone 15". */
  deviceName?: string;
  /** Launch headless (don’t bring Simulator app to foreground). */
  headless?: boolean;
  /** Boot timeout (ms). Default: 120_000. */
  bootTimeoutMs?: number;
  /** Shutdown simulator on WDIO onComplete. Default: false. */
  killOnComplete?: boolean;
};

export type DeviceServiceOpts = {
  platform: 'android' | 'ios';
  android?: AndroidOpts;
  ios?: IOSOpts;
  /** Verbose logging (console.warn). Default: true. */
  verbose?: boolean;
};

/**
 * DeviceLauncherService
 *
 * WDIO service that ensures an Android emulator or iOS Simulator is up and healthy
 * before sessions start, with retries and health checks. Optionally shuts it down
 * after the run. Designed for CI-friendly automation.
 *
 * Environment variables (in addition to options):
 * - ANDROID_EMULATOR_NAME, ANDROID_EMULATOR_PORT
 * - ANDROID_COLD_BOOT=1, ANDROID_NO_SNAPSHOT=1
 * - ANDROID_EMULATOR_RETRIES, ANDROID_HEALTHCHECK_RETRIES, ANDROID_HEALTHCHECK_INTERVAL_MS
 * - ANDROID_COLD_RESTART_ON_FAIL=1
 * - ANDROID_HEADLESS=1, IOS_HEADLESS=1, HEADLESS=1, CI=1
 * - IOS_UDID, IOS_DEVICE_NAME
 */
export default class DeviceLauncherService {
  private opts: DeviceServiceOpts;
  private androidSerial?: string;
  private iosUdid?: string;
  private started = false;

  constructor(_opts: DeviceServiceOpts) {
    this.opts = _opts;
  }

  /* ---------------- WDIO HOOKS ---------------- */

  /** Launcher process - runs before worker processes are started. */
  async onPrepare() {
    if (this.opts.platform === 'android') {
      await this.ensureAndroidReadyWithRetry({ context: 'onPrepare' });
    } else {
      await this.startIOS();
    }
  }

  /** Worker process - runs in a worker before the session is created. */
  async beforeSession() {
    if (this.opts.platform === 'android') {
      await this.ensureAndroidReadyWithRetry({ context: 'beforeSession' });
    }
  }

  /** After all workers have finished. */
  async onComplete() {
    if (!this.started) return;
    if (this.opts.platform === 'android') {
      const kill = this.opts.android?.killOnComplete ?? true;
      if (kill) await this.stopAndroid();
    } else {
      const kill = this.opts.ios?.killOnComplete ?? false;
      if (kill) await this.stopIOS();
    }
  }

  /* ---------------- ANDROID ---------------- */

  /**
   * High-level wrapper with retries and healthcheck.
   * Retries startup/heal sequence and tries `adb start-server` between attempts.
   */
  private async ensureAndroidReadyWithRetry(meta: { context: string }) {
    const retries = Number(process.env.ANDROID_EMULATOR_RETRIES ?? 2);
    const backoffBase = 1500;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.startOrHealAndroid();
        return;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        this.log(
          `[android] ensure ready failed (${meta.context}, attempt ${attempt + 1}/${retries + 1}): ${msg}`,
        );
        await this.tryAdbRestart(); // sometimes helps with "error: closed"
        if (attempt < retries) {
          await this.sleep(backoffBase * (attempt + 1));
          continue;
        }
        throw e;
      }
    }
  }

  /**
   * If emulator is running - verify health; otherwise start it.
   * If unhealthy, kill and cold-restart (configurable).
   */
  private async startOrHealAndroid() {
    const avdName = this.opts.android?.avdName || process.env.ANDROID_EMULATOR_NAME;
    if (!avdName) {
      this.log('[android] ANDROID_EMULATOR_NAME not provided - skipping auto start');
      return;
    }

    const devices = await this.adbDevices();
    const running = devices.find((d) => d.startsWith('emulator-'));
    if (running) {
      this.log(`[android] emulator already running: ${running}`);
      this.androidSerial = running;

      const ok = await this.isAndroidHealthy(running);
      if (ok) {
        this.started = true;
        this.log('[android] emulator is healthy');
        return;
      }

      this.log('[android] emulator looks unhealthy, restarting...');
      await this.stopAndroid().catch(() => {});
      // force cold restart if configured
      const coldRestart = envFlag('ANDROID_COLD_RESTART_ON_FAIL') ?? true;
      await this.startAndroid(coldRestart);
      return;
    }

    // none found - start one
    await this.startAndroid(false);
  }

  /**
   * Boot emulator and wait for readiness with a healthcheck.
   * @param forceColdBoot When true, uses `-no-snapshot-load` regardless of opts.
   */
  private async startAndroid(forceColdBoot: boolean) {
    const avdName = this.opts.android?.avdName || process.env.ANDROID_EMULATOR_NAME!;
    const port =
      this.opts.android?.port ||
      (process.env.ANDROID_EMULATOR_PORT ? Number(process.env.ANDROID_EMULATOR_PORT) : undefined);
    const bootTimeout = this.opts.android?.bootTimeoutMs ?? 240_000;
    const coldBoot =
      forceColdBoot || this.opts.android?.coldBoot || process.env.ANDROID_COLD_BOOT === '1';
    const noSnapshot = this.opts.android?.noSnapshot || process.env.ANDROID_NO_SNAPSHOT === '1';
    const headless =
      this.opts.android?.headless ??
      envFlag('ANDROID_HEADLESS') ??
      envFlag('HEADLESS') ??
      envFlag('CI') ??
      false;

    // Warm up ADB
    await this.tryAdbRestart();

    const emulatorCmd = this.emulatorCmd();
    const args = ['-avd', avdName, '-netdelay', 'none', '-netspeed', 'full', '-no-boot-anim'];
    if (typeof port === 'number') args.push('-port', String(port));
    if (coldBoot) args.push('-no-snapshot-load');
    if (noSnapshot) args.push('-no-snapshot');
    if (headless) args.push('-no-window');

    this.log(
      `[android] starting emulator: ${emulatorCmd} ${args.join(' ')} (headless=${headless})`,
    );
    const child = spawn(emulatorCmd, args, { stdio: 'ignore', detached: true });
    child.unref();

    // Wait for device to appear in adb
    const deadline = Date.now() + bootTimeout;
    let serial: string | undefined;
    while (Date.now() < deadline) {
      const ds = await this.adbDevices();
      serial = ds.find((d) => d.startsWith('emulator-'));
      if (serial) break;
      await this.sleep(1500);
    }
    if (!serial)
      throw new Error(
        `[android] emulator did not appear in "adb devices" within timeout ${bootTimeout}ms`,
      );

    this.androidSerial = serial;
    this.log(`[android] emulator device: ${serial}, waiting for boot to complete...`);
    await this.execAdb(serial, 'wait-for-device');

    // Wait for full boot (getprop/pm + bootanim)
    await this.waitForBootComplete(serial, deadline - Date.now());

    // Final healthcheck (with retries)
    const ok = await this.waitForAndroidHealthy(serial);
    if (!ok) throw new Error('[android] emulator failed healthcheck after boot');

    // Unlock screen
    await this.execAdb(serial, 'shell', 'input', 'keyevent', '82').catch(() => {});

    this.started = true;
    this.log('[android] emulator is ready & healthy');
  }

  /** Deep device health verification. */
  private async isAndroidHealthy(serial: string): Promise<boolean> {
    const interval = Number(process.env.ANDROID_HEALTHCHECK_INTERVAL_MS ?? 1500);

    try {
      // present in device list
      const list = await this.adbDevices();
      if (!list.includes(serial)) return false;

      // adb get-state
      const state = await this.execAdb(serial, 'get-state')
        .then((r) => r.stdout.trim())
        .catch(() => '');
      if (state !== 'device') return false;

      // platform version (filters out "error: closed")
      const rel = await this.execAdb(serial, 'shell', 'getprop', 'ro.build.version.release')
        .then((r) => r.stdout.trim())
        .catch(() => '');
      if (!rel) return false;

      // package manager is responsive
      const pm = await this.execAdb(serial, 'shell', 'pm', 'path', 'android')
        .then((r) => r.stdout.includes('package:'))
        .catch(() => false);
      if (!pm) return false;

      // boot completed?
      const s1 = await this.execAdb(serial, 'shell', 'getprop', 'sys.boot_completed')
        .then((r) => r.stdout.trim())
        .catch(() => '');
      if (s1 !== '1') {
        // give it a moment to finish booting
        await this.sleep(interval);
        const s2 = await this.execAdb(serial, 'shell', 'getprop', 'sys.boot_completed')
          .then((r) => r.stdout.trim())
          .catch(() => '');
        if (s2 !== '1') return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /** Wait until device becomes healthy, with a few attempts. */
  private async waitForAndroidHealthy(serial: string): Promise<boolean> {
    const retries = Number(process.env.ANDROID_HEALTHCHECK_RETRIES ?? 3);
    const interval = Number(process.env.ANDROID_HEALTHCHECK_INTERVAL_MS ?? 1500);

    for (let i = 0; i <= retries; i++) {
      if (await this.isAndroidHealthy(serial)) return true;
      await this.sleep(interval);
    }
    return false;
  }

  /** Stop emulator process. */
  private async stopAndroid() {
    const serial = this.androidSerial;
    if (!serial) {
      this.log('[android] no emulator serial tracked; skipping kill');
      return;
    }
    this.log(`[android] killing emulator ${serial} ...`);
    try {
      await this.execAdb(serial, 'emu', 'kill');
    } catch (e) {
      this.log(
        `[android] failed to kill via "emu kill", trying adb kill-server: ${(e as Error).message}`,
      );
      await exec('adb kill-server').catch(() => {});
    }
  }

  /** Return list of adb device serials (first column of `adb devices`). */
  private async adbDevices(): Promise<string[]> {
    const { stdout } = await exec('adb devices');
    const lines = stdout.split('\n').slice(1);
    return lines.map((l) => l.trim().split('\t')[0]).filter(Boolean);
  }

  /** Execute `adb -s <serial> ...` with logging. */
  private async execAdb(serial: string, ...args: string[]) {
    const cmd = ['adb', '-s', serial, ...args].join(' ');
    this.log(`[android] $ ${cmd}`);
    return exec(cmd);
  }

  /** Wait for boot completion based on multiple system properties/pm checks. */
  private async waitForBootComplete(serial: string, timeoutMs: number) {
    const deadline = Date.now() + Math.max(timeoutMs ?? 0, 60_000);
    while (Date.now() < deadline) {
      const [p1, p2, p3] = await Promise.allSettled([
        this.execAdb(serial, 'shell', 'getprop', 'sys.boot_completed'),
        this.execAdb(serial, 'shell', 'getprop', 'dev.bootcomplete'),
        this.execAdb(serial, 'shell', 'getprop', 'init.svc.bootanim'),
      ]);

      const s1 = p1.status === 'fulfilled' ? p1.value.stdout.trim() : '';
      const s2 = p2.status === 'fulfilled' ? p2.value.stdout.trim() : '';
      const s3 = p3.status === 'fulfilled' ? p3.value.stdout.trim() : '';

      const bootOk = s1 === '1' || s2 === '1';
      const animOk = !s3 || s3 === 'stopped';

      const pmOk = await this.execAdb(serial, 'shell', 'pm', 'path', 'android')
        .then((r) => r.stdout.includes('package:'))
        .catch(() => false);

      if ((bootOk && animOk) || (bootOk && pmOk)) return;
      await this.sleep(1500);
    }

    // last chance quick check
    try {
      const { stdout } = await this.execAdb(serial, 'shell', 'getprop', 'sys.boot_completed');
      if (stdout.trim() === '1') return;
    } catch {}
    throw new Error('[android] emulator boot timeout (sys.boot_completed != 1)');
  }

  /** Platform-specific emulator binary name. */
  private emulatorCmd(): string {
    return os.platform() === 'win32' ? 'emulator.exe' : 'emulator';
  }

  /** Attempt to ensure ADB server is up. */
  private async tryAdbRestart() {
    try {
      await exec('adb start-server');
    } catch {}
  }

  /* ---------------- iOS (semantics unchanged) ---------------- */

  /** Start iOS Simulator (macOS only), wait until booted. */
  private async startIOS() {
    if (os.platform() !== 'darwin') {
      this.log('[ios] not macOS; skipping simulator autostart');
      return;
    }
    const udid = this.opts.ios?.udid || process.env.IOS_UDID;
    const deviceName = this.opts.ios?.deviceName || process.env.IOS_DEVICE_NAME || 'iPhone 15';
    const bootTimeout = this.opts.ios?.bootTimeoutMs ?? 120_000;

    let targetUdid = udid;
    if (!targetUdid) targetUdid = await this.findUdidByName(deviceName);
    if (!targetUdid) {
      this.log(`[ios] device "${deviceName}" not found. Create via Xcode or provide IOS_UDID.`);
      return;
    }

    const alreadyBooted = await this.isBooted(targetUdid);
    if (alreadyBooted) {
      this.log(`[ios] simulator already booted: ${targetUdid}`);
      this.iosUdid = targetUdid;
      return;
    }

    this.log(`[ios] booting simulator ${targetUdid} (${deviceName}) ...`);
    const headless =
      this.opts.ios?.headless ??
      envFlag('IOS_HEADLESS') ??
      envFlag('HEADLESS') ??
      envFlag('CI') ??
      false;

    await exec(`xcrun simctl boot ${targetUdid}`);
    if (!headless) await exec(`open -a Simulator`).catch(() => {});

    // wait until booted
    const deadline = Date.now() + bootTimeout;
    while (Date.now() < deadline) {
      const ok = await this.isBooted(targetUdid);
      if (ok) break;
      await this.sleep(1000);
    }
    const ok = await this.isBooted(targetUdid);
    if (!ok) throw new Error('[ios] simulator boot timeout');

    this.iosUdid = targetUdid;
    this.started = true;
    this.log('[ios] simulator is ready');
  }

  /** Shutdown Simulator if tracked. */
  private async stopIOS() {
    if (!this.iosUdid) {
      this.log('[ios] no UDID tracked; skipping shutdown');
      return;
    }
    this.log(`[ios] shutting down simulator ${this.iosUdid} ...`);
    await exec(`xcrun simctl shutdown ${this.iosUdid}`).catch(() => {});
  }

  /** Check if a simulator UDID is currently booted. */
  private async isBooted(udid: string): Promise<boolean> {
    try {
      const { stdout } = await exec(`xcrun simctl list devices booted | grep ${udid}`);
      return stdout.includes(udid);
    } catch {
      return false;
    }
  }

  /** Resolve a simulator UDID by human-readable device name. */
  private async findUdidByName(name: string): Promise<string | undefined> {
    try {
      const { stdout } = await exec(
        `xcrun simctl list devices | grep "${name}" | grep -v unavailable | tail -n 1`,
      );
      const match = stdout.match(/[0-9A-F-]{36}/i);
      return match?.[0];
    } catch {
      return undefined;
    }
  }

  /* ---------------- misc ---------------- */

  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private log(msg: string) {
    if (this.opts.verbose ?? true) console.warn(`[device-service] ${msg}`);
  }
}
