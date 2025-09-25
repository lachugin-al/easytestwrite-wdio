import allure from '@wdio/allure-reporter';

export type Severity = 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial';
type SeverityLoose = Severity | Uppercase<Severity>;

/**
 * Allure metadata payload for a test.
 *
 * You can set common business context (epic/feature/story),
 * ownership, suite hierarchy, severity, tags, TMS/Issue links,
 * arbitrary labels and cross-links.
 */
export type Meta = {
  // Basic labels
  displayName?: string;
  owner?: string;
  epic?: string;
  feature?: string;
  story?: string;
  severity?: SeverityLoose;

  // Suite hierarchy
  parentSuite?: string;
  suite?: string;
  subSuite?: string;

  // Misc
  description?: string;
  tags?: string[];
  /** Issue tuple: [id, optional human-friendly name] */
  issue?: [id: string, name?: string];
  /** TMS tuple: [id, optional human-friendly name] */
  tms?: [id: string, name?: string];

  // Extra
  links?: Array<{ url: string; name?: string; type?: string }>;
  labels?: Record<string, string>;
  allureId?: string;
  /** Alternative alias for TMS id */
  testId?: string;
};

/**
 * Apply Allure metadata to the current test.
 *
 * IMPORTANT: environment variables in WDIO should be configured in the reporter,
 * not from inside tests:
 *
 *   reporters: [
 *     ['allure', { reportedEnvironmentVars: { ... } }]
 *   ]
 *
 * @param m Metadata to apply.
 */
export function setMeta(m: Meta) {
  // Name / owner
  if (m.displayName) allure.addLabel('displayName', m.displayName);
  if (m.owner) allure.addLabel('owner', m.owner);

  // Business context
  if (m.epic) allure.addLabel('epic', m.epic);
  if (m.feature) allure.addFeature(m.feature);
  if (m.story) allure.addLabel('story', m.story);

  // Severity
  if (m.severity) allure.addSeverity(normalizeSeverity(m.severity));

  // Suite hierarchy
  if (m.parentSuite) allure.addLabel('parentSuite', m.parentSuite);
  if (m.suite) allure.addLabel('suite', m.suite);
  if (m.subSuite) allure.addLabel('subSuite', m.subSuite);

  // Description
  if (m.description) allure.addDescription(m.description, 'text');

  // Tags
  if (m.tags?.length) for (const t of m.tags) allure.addLabel('tag', t);

  // Issue / TMS
  if (m.issue) {
    const [id, name] = m.issue;
    allure.addIssue(id);
    if (name) allure.addLabel('issueName', name);
  }
  if (m.tms) {
    const [id, name] = m.tms;
    allure.addTestId(id);
    if (name) allure.addLabel('tmsName', name);
  }

  // Links
  if (m.links?.length) {
    for (const l of m.links) allure.addLink(l.url, l.name, l.type);
  }

  // Arbitrary labels
  if (m.labels) {
    for (const [k, v] of Object.entries(m.labels)) {
      allure.addLabel(k, v);
    }
  }

  // Allure/Test IDs
  if (m.allureId) allure.addAllureId(m.allureId);
  if (m.testId) allure.addTestId(m.testId);
}

/**
 * Add one or more tag labels (can be called mid-test).
 * @param tags Tag values to add as Allure labels.
 */
export function addTags(...tags: string[]) {
  for (const t of tags) allure.addLabel('tag', t);
}

/**
 * Add an Issue link.
 * @param id   Issue identifier (e.g., JIRA key).
 * @param name Optional human-friendly name/label for the issue.
 */
export function addIssue(id: string, name?: string) {
  allure.addIssue(id);
  if (name) allure.addLabel('issueName', name);
}

/**
 * Add a TMS (Test Management System) link.
 * @param id   Test case identifier in TMS.
 * @param name Optional human-friendly name/label for the test case.
 */
export function addTms(id: string, name?: string) {
  allure.addTestId(id);
  if (name) allure.addLabel('tmsName', name);
}

/**
 * Add an arbitrary hyperlink to the report.
 * @param url  Target URL.
 * @param name Optional link title.
 * @param type Optional link type (e.g., 'issue', 'tms', 'custom').
 */
export function addLink(url: string, name?: string, type?: string) {
  allure.addLink(url, name, type);
}

/**
 * (Optional) Attach the provided ENV map as a JSON attachment.
 * Note: this is NOT the Allure "Environment" panel, but it is useful for debugging.
 * To populate the official Environment panel, configure `reportedEnvironmentVars` in the reporter.
 *
 * @param vars Key-value pairs to serialize as JSON.
 * @param name Attachment file name (defaults to `env.json`).
 */
export function attachEnvSnapshot(vars: Record<string, string>, name = 'env.json') {
  try {
    const json = JSON.stringify(vars, null, 2);
    allure.addAttachment(name, json, 'application/json');
  } catch {}
}

/**
 * Normalize severity input (case-insensitive) to a valid Allure severity value.
 * Falls back to 'normal' if the value is unknown.
 *
 * @param sev Input severity (case-insensitive).
 * @returns One of: 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial'
 */
function normalizeSeverity(sev: SeverityLoose): Severity {
  const s = String(sev).toLowerCase() as Severity;
  const allowed: Severity[] = ['blocker', 'critical', 'normal', 'minor', 'trivial'];
  return allowed.includes(s) ? s : 'normal';
}
