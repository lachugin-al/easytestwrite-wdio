import { browser, driver } from '@wdio/globals';

/**
 * Input locator: supports a canonical WDIO string selector
 * and an Appium-style object { using, value } which is normalized to a string.
 */
export type LocatorInput = string | { using: string; value: string };

/**
 * Cross-platform element descriptor.
 *
 * Keeps fallback lists of selectors for Android, iOS and universal buckets
 * (all stored in canonical WDIO string form).
 *
 * Use {@link toSelector} to get the first best selector for the current platform
 * or {@link selectors} to get all relevant fallbacks in order.
 */
export class PageElement {
  private android?: string[] | null;
  private ios?: string[] | null;
  private universal?: string[] | null;

  /**
   * Create a PageElement with optional platform-specific/universal selectors.
   * Each entry may be a single locator or a list. All inputs are normalized to WDIO strings.
   */
  constructor(opts?: {
    android?: LocatorInput | LocatorInput[] | null;
    ios?: LocatorInput | LocatorInput[] | null;
    universal?: LocatorInput | LocatorInput[] | null;
  }) {
    this.android = normalizeList(opts?.android);
    this.ios = normalizeList(opts?.ios);
    this.universal = normalizeList(opts?.universal);
  }

  /**
   * Returns the first suitable selector for the current platform.
   *
   * Priority: platform-specific → universal.
   * If platform is not yet known (e.g., before session start), falls back to
   * the first available selector among android/ios/universal.
   */
  toSelector(): string | null {
    const list = this.selectors();
    if (list.length) return list[0];
    // Fallback when platform is unknown (before session is started)
    return this.android?.[0] ?? this.ios?.[0] ?? this.universal?.[0] ?? null;
  }

  /**
   * Returns all relevant selectors in fallback order for the current platform.
   *
   * Android: [android..., universal...]
   * iOS: [ios..., universal...]
   * Unknown: [universal...] (if any), but see {@link toSelector} for hard fallback.
   */
  selectors(): string[] {
    const out: string[] = [];
    const plat = getPlatform();
    if (plat === 'android' && this.android) out.push(...this.android);
    if (plat === 'ios' && this.ios) out.push(...this.ios);
    if (this.universal) out.push(...this.universal);
    return out;
  }

  /**
   * Append fallback locators (chainable). Inputs are normalized to WDIO strings.
   */
  withFallbacks(opts?: {
    android?: LocatorInput | LocatorInput[] | null;
    ios?: LocatorInput | LocatorInput[] | null;
    universal?: LocatorInput | LocatorInput[] | null;
  }): PageElement {
    if (opts?.android) (this.android ||= []).push(...normalizeList(opts.android)!);
    if (opts?.ios) (this.ios ||= []).push(...normalizeList(opts.ios)!);
    if (opts?.universal) (this.universal ||= []).push(...normalizeList(opts.universal)!);
    return this;
  }

  // ===================== HIGH-LEVEL FACTORIES =====================

  /** Cross-platform accessibility id. */
  static byAccessibilityId(id: string): PageElement {
    const s = toAccId(id);
    return new PageElement({ android: s, ios: s, universal: s });
  }

  /** Android-only accessibility id. */
  static byAndroidAccessibilityId(id: string): PageElement {
    return new PageElement({ android: toAccId(id) });
  }

  /** iOS-only accessibility id. */
  static byIOSAccessibilityId(id: string): PageElement {
    return new PageElement({ ios: toAccId(id) });
  }

  /** Android UIAutomator expression. */
  static byAndroidUIAutomator(expr: string): PageElement {
    return new PageElement({ android: toAndroidUIA(expr) });
  }

  /** iOS NSPredicate string. */
  static byIOSPredicate(expr: string): PageElement {
    return new PageElement({ ios: toIOSPredicate(expr) });
  }

  /** iOS Class Chain. */
  static byIOSClassChain(chain: string): PageElement {
    return new PageElement({ ios: toIOSClassChain(chain) });
  }

  /** Universal XPath. */
  static byXPath(xpath: string): PageElement {
    return new PageElement({ universal: toXPath(xpath) });
  }

  /**
   * Exact text:
   *  - Android: UiSelector.text("...")
   *  - iOS: NSPredicate equality on name/label/value.
   */
  static byTextExact(text: string): PageElement {
    return new PageElement({
      android: toAndroidUIA(`new UiSelector().text(${quoteJava(text)})`),
      ios: toIOSPredicate(
        `name == ${quoteNS(text)} OR label == ${quoteNS(text)} OR value == ${quoteNS(text)}`,
      ),
    });
  }

  /**
   * Text substring:
   *  - Android: UiSelector.textContains("...")
   *  - iOS: NSPredicate CONTAINS on name/label/value.
   */
  static byTextContains(text: string): PageElement {
    return new PageElement({
      android: toAndroidUIA(`new UiSelector().textContains(${quoteJava(text)})`),
      ios: toIOSPredicate(
        `name CONTAINS ${quoteNS(text)} OR label CONTAINS ${quoteNS(text)} OR value CONTAINS ${quoteNS(text)}`,
      ),
    });
  }

  /**
   * Android resource-id.
   *
   * By default, attempts to prepend the app package (if known).
   * If the package is unknown or regex is requested, uses `resourceIdMatches`
   * with a pattern that accepts both short and fully qualified ids.
   */
  static byResourceId(id: string, opts?: { includePackagePrefix?: boolean; regex?: boolean }) {
    const pkg = getAndroidAppPackage();
    const wantPrefix = opts?.includePackagePrefix ?? true;

    if (wantPrefix && pkg && !opts?.regex) {
      const full = `${pkg}:id/${id}`;
      return new PageElement({
        android: toAndroidUIA(`new UiSelector().resourceId(${quoteJava(full)})`),
      });
    }

    // regex: (anything:id/)?<id>$
    const rx = `(.+:id/)?${escapeRegex(id)}$`;
    return new PageElement({
      android: toAndroidUIA(`new UiSelector().resourceIdMatches(${quoteJava(rx)})`),
    });
  }

  /** Composite factory: set android/ios/universal selectors at once (lists or single). */
  static compose(opts: {
    android?: LocatorInput | LocatorInput[] | null;
    ios?: LocatorInput | LocatorInput[] | null;
    universal?: LocatorInput | LocatorInput[] | null;
  }): PageElement {
    return new PageElement(opts);
  }

  // ===================== LOW-LEVEL BUILDERS =====================

  /** WDIO accessibility id → `"~value"`. */
  static AccessibilityId(accessibilityId: string): string {
    return toAccId(accessibilityId);
  }
  /** WDIO Android UIAutomator → `"android=<expr>"`. */
  static AndroidUIAutomator(expr: string): string {
    return toAndroidUIA(expr);
  }
  /** WDIO iOS Predicate → `"-ios predicate string:<pred>"`. */
  static IOSPredicateString(expr: string): string {
    return toIOSPredicate(expr);
  }
  /** WDIO iOS Class Chain → `"-ios class chain:<chain>"`. */
  static IOSClassChain(expr: string): string {
    return toIOSClassChain(expr);
  }
  /** WDIO XPath - plain XPath string (starting with // or .//). */
  static XPath(xpathExpression: string): string {
    return toXPath(xpathExpression);
  }

  /**
   * Safe string injection for XPath literal.
   * Returns a single-quoted value when possible, otherwise a concat(...) expression.
   */
  static escapeXPath(s: string): string {
    if (!s.includes("'")) return `'${s}'`;
    if (!s.includes('"')) return `"${s}"`;
    const parts = s.split("'");
    return 'concat(' + parts.map((p, i) => (i ? `"'","${p}"` : `"${p}"`)).join(',') + ')';
  }
}

/* ============================= HELPERS ============================= */

/**
 * Detects current platform from WDIO runtime flags.
 * Returns 'android' | 'ios' | null (when the session is not started yet).
 */
function getPlatform(): 'android' | 'ios' | null {
  // WDIO sets these flags at runtime
  if (driver && (driver as any).isAndroid) return 'android';
  if (driver && (driver as any).isIOS) return 'ios';
  return null;
}

let ANDROID_APP_PACKAGE_CACHE: string | undefined;

/** Try to get appPackage from the current session caps or ENV once and cache it. */
function getAndroidAppPackage(): string | undefined {
  if (ANDROID_APP_PACKAGE_CACHE) return ANDROID_APP_PACKAGE_CACHE;
  const caps = browser?.capabilities as Record<string, any> | undefined;
  const fromCaps = caps?.['appium:appPackage'] || caps?.appPackage;
  const fromEnv = process.env.ANDROID_APP_PACKAGE;
  ANDROID_APP_PACKAGE_CACHE = fromCaps || fromEnv || undefined;
  return ANDROID_APP_PACKAGE_CACHE;
}

/** (Optional) Manually pin the Android app package for resource-id helpers. */
export function setAndroidAppPackage(pkg: string) {
  ANDROID_APP_PACKAGE_CACHE = pkg;
}

/** Normalize a list of input locators to canonical WDIO string selectors. */
function normalizeList(val?: LocatorInput | LocatorInput[] | null): string[] | null {
  if (val == null) return null;
  const arr = Array.isArray(val) ? val : [val];
  const mapped = arr.map(normalizeOne).filter(Boolean) as string[];
  return mapped.length ? mapped : null;
}

/** Normalize a single input locator to a WDIO string selector. */
function normalizeOne(loc: LocatorInput): string | null {
  if (typeof loc === 'string') return loc.trim();

  const using = loc.using.trim().toLowerCase();
  const value = loc.value;

  switch (using) {
    case 'xpath':
      return toXPath(value);
    case 'accessibility id':
      return toAccId(value);
    case '-android uiautomator':
    case 'android uiautomator':
      return toAndroidUIA(value);
    case '-ios predicate string':
    case 'ios predicate string':
      return toIOSPredicate(value);
    case '-ios class chain':
    case 'ios class chain':
      return toIOSClassChain(value);
    default:
      // Web strategies ('css selector', 'id', 'name', ...) - pass through as-is
      return value;
  }
}

/** WDIO: accessibility id → "~value". */
function toAccId(v: string): string {
  return `~${v}`;
}

/** WDIO: Android UIAutomator → "android=<expr>". */
function toAndroidUIA(expr: string): string {
  return `android=${expr}`;
}

/** WDIO: iOS Predicate → "-ios predicate string:<pred>". */
function toIOSPredicate(pred: string): string {
  return `-ios predicate string:${pred}`;
}

/** WDIO: iOS Class Chain → "-ios class chain:<chain>". */
function toIOSClassChain(chain: string): string {
  return `-ios class chain:${chain}`;
}

/** WDIO: XPath - keep as-is (must start with // or .//). */
function toXPath(x: string): string {
  return x;
}

/** Escaping for Java string literals (UiSelector). */
function quoteJava(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** Escaping for NSPredicate (iOS). */
function quoteNS(s: string): string {
  const escaped = s.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** Escaping for RegExp used in resourceIdMatches. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
