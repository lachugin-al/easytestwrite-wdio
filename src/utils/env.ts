/**
 * Check if a value is a truthy flag:
 * accepts 1 | "1" | "true" | "yes" | "on" (case-insensitive).
 */
export const isTruthy = (v?: string | number | boolean | null) =>
  /^(1|true|yes|on)$/i.test(String(v ?? ''));

/**
 * Convert an env string into boolean using {@link isTruthy}.
 * If value is undefined/null, returns the provided default.
 */
export const boolFrom = (envVal: string | undefined, def = false) =>
  envVal == null ? def : isTruthy(envVal);

/**
 * Convert an env string into a finite number.
 * Returns `def` when empty/undefined or when parsing fails.
 */
export const numFrom = (envVal: string | undefined, def?: number) => {
  if (envVal == null || envVal === '') return def;
  const n = Number(envVal);
  return Number.isFinite(n) ? n : def;
};

/**
 * Parse JSON from an env string with a safe fallback.
 * Returns `def` on missing value or parse error.
 */
export const jsonFrom = <T>(envVal: string | undefined, def: T): T => {
  if (!envVal) return def;
  try {
    return JSON.parse(envVal) as T;
  } catch {
    return def;
  }
};

// --- direct readers from process.env ---

/** Read string from process.env with optional default. */
export const envStr = (name: string, def?: string) => process.env[name] ?? def;
/** Read number from process.env via {@link numFrom}. */
export const envNum = (name: string, def?: number) => numFrom(process.env[name], def);
/** Read boolean from process.env via {@link boolFrom}. */
export const envBool = (name: string, def = false) => boolFrom(process.env[name], def);

/**
 * Read a boolean flag from process.env:
 * - returns `true/false` if the variable is defined (parsed via {@link isTruthy}),
 * - returns `undefined` if the variable is not set at all.
 */
export const envFlag = (name: string): boolean | undefined =>
  process.env[name] == null ? undefined : isTruthy(process.env[name]);

/**
 * Return the first value that is not `undefined`.
 */
export const firstDefined = <T>(...vals: (T | undefined)[]) => vals.find((v) => v !== undefined);
