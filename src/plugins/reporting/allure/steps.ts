import allure from '@wdio/allure-reporter';
import { browser } from '@wdio/globals';

import { attachFailureBundle } from '../../../runtime/diagnostics.js';

const truthy = (v?: string) => /^(1|true|yes|on)$/i.test(String(v ?? ''));

// Infer endStep status type from the reporter signature
type EndStepStatus = Parameters<typeof allure.endStep>[0];

// Screenshot policy
type ScreenshotMode = 'always' | 'onFail' | 'off';

export type StepOptions = {
  /**
   * Screenshot policy: 'always' | 'onFail' | 'off'.
   * Booleans are accepted for convenience: true → 'always', false → 'off'.
   */
  screenshot?: ScreenshotMode | boolean;
};

/**
 * Resolve the default screenshot mode from env:
 * STEP_SCREENSHOT in {'always' | 'true' | '1' | 'yes' | 'on'} → 'always'
 * STEP_SCREENSHOT in {'off' | 'false' | '0' | 'no'} → 'off'
 * otherwise → 'onFail'
 */
function screenshotModeFromEnv(): ScreenshotMode {
  const v = String(process.env.STEP_SCREENSHOT ?? '').toLowerCase();
  if (['always', 'true', '1', 'yes', 'on'].includes(v)) return 'always';
  if (['off', 'false', '0', 'no'].includes(v)) return 'off';
  return 'onFail';
}

/** Normalize boolean/union into a concrete ScreenshotMode. */
function normalizeMode(m?: ScreenshotMode | boolean): ScreenshotMode {
  if (typeof m === 'boolean') return m ? 'always' : 'off';
  return m ?? screenshotModeFromEnv();
}

/**
 * Take a screenshot and attach it to Allure.
 * Attachment name is made safer/shorter by stripping special characters.
 */
async function attachStepScreenshot(title: string) {
  try {
    const png = await browser.takeScreenshot();
    // make the attachment name more readable
    const safe = title.replace(/[^\wа-яё -]+/gi, '').slice(0, 120);
    allure.addAttachment(`screenshot: ${safe}`, Buffer.from(png, 'base64'), 'image/png');
  } catch {
    // swallowing attachment errors is intentional to not fail the step
  }
}

/**
 * Wrap an async/sync function into an Allure step with optional screenshots.
 *
 * Behavior:
 * - Starts a step with the provided title.
 * - On success: optionally attaches a screenshot (if mode='always') and ends the step as 'passed'.
 * - On failure: optionally attaches a screenshot (mode!='off'), optionally attaches a diagnostics bundle
 *   when AUTO_EXPLAIN_FAILURE is truthy, and ends the step as 'failed', rethrowing the error.
 *
 * @param title Human-readable step title.
 * @param fn    Step body (can be sync or async).
 * @param opts  Step options (screenshot policy).
 * @returns     The result of the wrapped function.
 */
export function step<T>(title: string, fn: () => Promise<T> | T, opts?: StepOptions): Promise<T> {
  const mode = normalizeMode(opts?.screenshot);
  allure.startStep(title);

  const run = async () => await fn();

  return run()
    .then(async (res) => {
      if (mode === 'always') await attachStepScreenshot(title);
      allure.endStep('passed' as EndStepStatus);
      return res;
    })
    .catch(async (err) => {
      if (mode !== 'off') await attachStepScreenshot(title); // onFail / always
      if (truthy(process.env.AUTO_EXPLAIN_FAILURE)) {
        await attachFailureBundle('failure-bundle.json');
      }
      allure.endStep('failed' as EndStepStatus);
      throw err;
    });
}

/**
 * Template helper:
 *
 * Usage:
 *   await s`Login as ${user}`(async () => {
 *     // step body
 *   }, { screenshot: 'onFail' });
 *
 * Produces a step title from template literals and returns a function that
 * accepts the step body and optional options.
 */
export function s(strings: TemplateStringsArray, ...expr: any[]) {
  const title = strings.reduce(
    (acc, s, i) => acc + s + (i < expr.length ? String(expr[i]) : ''),
    '',
  );
  return <T>(fn: () => Promise<T> | T, opts?: StepOptions) => step(title, fn, opts);
}
