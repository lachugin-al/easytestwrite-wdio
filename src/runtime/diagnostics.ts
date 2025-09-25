import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

import allure from '@wdio/allure-reporter';
import { driver, browser } from '@wdio/globals';

const exec = promisify(_exec);

/**
 * Failure bundle is a diagnostic snapshot collected on test failure.
 */
export type FailureBundle = {
  timestamp: string;
  platform: 'android' | 'ios';
  sessionId?: string;
  context?: string;
  contexts?: string[];
  windowRect?: { x: number; y: number; width: number; height: number };
  /** Page source (may be truncated). */
  pageSource?: string;
  app?: { packageId?: string; bundleId?: string; activity?: string };
  permissions?: {
    granted?: string[];
    denied?: string[];
    /** Raw `dumpsys package` output (optional, may be truncated). */
    raw?: string;
    /** iOS TCC table snapshot (Simulator only). */
    iosTcc?: Array<{ service: string; allowed: number; prompt_count: number }>;
  };
  /** Additional notes and errors encountered while collecting the bundle. */
  notes?: string[];
};

/**
 * Options for collecting a failure bundle.
 */
export type FailureBundleOpts = {
  /** Whether to include page source (default: true). */
  includePageSource?: boolean;
  /** Max length of page source to include (default: 250_000). */
  maxSourceLength?: number;
  /** Override Android package id (otherwise read from driver/env). */
  packageId?: string;
  /** Override iOS bundle id (otherwise read from env). */
  bundleId?: string;
  /** Attachment name (used in {@link attachFailureBundle}). */
  name?: string;
};

const truthy = (v?: string) => /^(1|true|yes|on)$/i.test(String(v ?? ''));

/**
 * Collect a comprehensive diagnostic bundle for the current session.
 *
 * Includes:
 * - platform and sessionId
 * - current context(s)
 * - window rectangle
 * - (optionally) truncated page source
 * - app package/bundle/activity
 * - granted/denied permissions (Android) or TCC permissions (iOS Simulator)
 *
 * @param opts See {@link FailureBundleOpts}
 * @returns A {@link FailureBundle} object ready to be serialized.
 */
export async function collectFailureBundle(opts: FailureBundleOpts = {}): Promise<FailureBundle> {
  const includeSource = opts.includePageSource ?? true;
  const maxLen = opts.maxSourceLength ?? 250_000;

  const platform: 'android' | 'ios' = driver.isAndroid ? 'android' : 'ios';
  const notes: string[] = [];
  const bundle: FailureBundle = {
    timestamp: new Date().toISOString(),
    platform,
    sessionId: (browser as any).sessionId || (driver as any).sessionId,
    notes,
  };

  // Try to get current context and list of contexts
  try {
    bundle.context = await (driver as any).getContext?.();
  } catch {
    /* ignore */
  }
  try {
    bundle.contexts = await (driver as any).getContexts?.();
  } catch {
    /* ignore */
  }

  // Window rect (safe even in webview/native contexts)
  try {
    bundle.windowRect = await driver.getWindowRect();
  } catch {
    /* ignore */
  }

  // Page source (may be large, so we truncate if needed)
  if (includeSource) {
    try {
      const src = await driver.getPageSource();
      bundle.pageSource =
        src.length > maxLen
          ? src.slice(0, maxLen) + `\n/* truncated ${src.length - maxLen} chars */`
          : src;
    } catch (e: any) {
      notes.push(`getPageSource() failed: ${e?.message ?? String(e)}`);
    }
  }

  // Platform-specific: collect app info and permissions
  if (platform === 'android') {
    let pkg = opts.packageId;
    try {
      if (!pkg) pkg = await (driver as any).getCurrentPackage?.();
    } catch {}
    if (!pkg) pkg = process.env.ANDROID_APP_PACKAGE;
    let activity: string | undefined;
    try {
      activity = await (driver as any).getCurrentActivity?.();
    } catch {}

    bundle.app = { packageId: pkg, activity };

    // Collect permission state from `dumpsys package`
    if (pkg) {
      try {
        const raw = String(
          (await driver.execute('mobile: shell', {
            command: 'dumpsys',
            args: ['package', pkg],
          })) as any,
        );
        const granted: string[] = [];
        const denied: string[] = [];

        // First try to parse grantedPermissions block
        const m = raw.match(/grantedPermissions:\s*\[([^\]]*)\]/s);
        if (m) {
          granted.push(
            ...m[1]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          );
        } else {
          // Fallback: parse lines like "android.permission.CAMERA: granted=true"
          for (const line of raw.split('\n')) {
            const m2 = line.match(
              /(android\.permission\.[\w_]+)\s*:\s*granted\s*=\s*(true|false)/i,
            );
            if (m2) (m2[2].toLowerCase() === 'true' ? granted : denied).push(m2[1]);
          }
        }
        bundle.permissions = {
          granted: Array.from(new Set(granted)).sort(),
          denied: Array.from(new Set(denied)).sort(),
          raw: undefined,
        };
        // Optionally include full raw `dumpsys` output for debugging
        if (truthy(process.env.AUTO_EXPLAIN_INCLUDE_RAW))
          bundle.permissions!.raw = raw.slice(0, 250_000);
      } catch (e: any) {
        notes.push(`android dumpsys parse failed: ${e?.message ?? String(e)}`);
      }
    } else {
      notes.push(
        'packageId not resolved for Android (set ANDROID_APP_PACKAGE or pass opts.packageId)',
      );
    }
  } else {
    // iOS
    const udid = process.env.IOS_UDID;
    const bundleId = opts.bundleId || process.env.IOS_BUNDLE_ID;
    bundle.app = { bundleId };

    // Collect TCC permissions (Simulator only)
    if (udid && bundleId) {
      try {
        const tccPath = `${process.env.HOME}/Library/Developer/CoreSimulator/Devices/${udid}/data/Library/TCC/TCC.db`;
        const { stdout } = await exec(
          `sqlite3 "${tccPath}" "select service, allowed, prompt_count from access where client='${bundleId}'"`,
        );
        const rows = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [service, allowedStr, promptStr] = line.split('|');
            return { service, allowed: Number(allowedStr), prompt_count: Number(promptStr) };
          });
        bundle.permissions = { iosTcc: rows };
      } catch (e: any) {
        notes.push(`iOS Simulator TCC read failed: ${e?.message ?? String(e)}`);
      }
    } else {
      notes.push(
        'iOS permissions collection requires IOS_UDID and bundleId (IOS_BUNDLE_ID or opts.bundleId)',
      );
    }
  }

  return bundle;
}

/**
 * Collect and attach a failure bundle as a JSON attachment in Allure.
 *
 * Even if collection fails, attaches an object with the error message.
 *
 * @param name Attachment name (default: `failure-bundle.json`).
 * @param opts Options for {@link collectFailureBundle}.
 */
export async function attachFailureBundle(
  name = 'failure-bundle.json',
  opts: FailureBundleOpts = {},
) {
  try {
    const data = await collectFailureBundle(opts);
    const json = JSON.stringify(data, null, 2);
    allure.addAttachment(name, json, 'application/json');
  } catch (e: any) {
    // Last-resort fallback: attach error message so the report isn't empty
    const json = JSON.stringify({ error: e?.message ?? String(e) }, null, 2);
    allure.addAttachment(name, json, 'application/json');
  }
}
