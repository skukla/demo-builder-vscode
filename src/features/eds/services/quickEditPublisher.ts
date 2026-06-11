/**
 * Quick Edit vendoring step — Experience Workspace (EW) WYSIWYG wiring.
 *
 * Vendors da.live's Quick Edit dependency into every EDS storefront so the
 * EW "Layout" (WYSIWYG) view can invoke it. Two surgical edits to
 * `scripts/scripts.js` plus one net-new module file. Inert under Universal
 * Editor (the Sidekick `quick-edit` plugin — registered separately in the
 * Config Service template — only fires under EW), so this runs for ALL EDS
 * projects at create AND reset, idempotently.
 *
 * Modeled exactly on `pdp404HandlerPublisher`:
 *   - `GitHubFileOperations.getFileContent` → idempotent marker check →
 *     `createOrUpdateFile` (SHA-aware).
 *   - Non-fatal at every step: any failure logs and returns
 *     `{ installed: false, reason }`. Never throws. The storefront still
 *     works without Quick Edit — it just can't enter the WYSIWYG view.
 *
 * The two `scripts.js` edits and the `quick-edit.js` body are faithful to
 * Adobe's documented Quick Edit wiring (docs.da.live/about/early-access/
 * quick-edit, "Option 2: Existing Projects"):
 *   1. Add `export` to the `loadPage` declaration.
 *   2. Append a `?quick-edit` query-param dynamic-import branch that imports
 *      `../tools/quick-edit/quick-edit.js`.
 *
 * The Sidekick `quick-edit` plugin entry (the Config-Service half of the
 * wiring) lives in `config-template.json` — see Step 2.
 *
 * @module features/eds/services/quickEditPublisher
 */

import { GitHubFileOperations } from './githubFileOperations';
import type { Logger } from '@/types/logger';

/** Storefront-relative path to the canonical entry script. */
export const SCRIPTS_JS_PATH = 'scripts/scripts.js';

/** Storefront-relative path to the net-new Quick Edit module. */
export const QUICK_EDIT_JS_PATH = 'tools/quick-edit/quick-edit.js';

/**
 * Literal anchor for edit #1 — the canonical un-exported `loadPage`
 * declaration in `hlxsites/aem-boilerplate-commerce` `scripts/scripts.js`.
 *
 * Stable string pinned by `quickEditAnchorMatch.test.ts` against the
 * LKG-pinned canonical fixture. DO NOT edit without bumping the canonical
 * fixture (and the anchor-match test will tell you the moment it drifts).
 */
export const QUICK_EDIT_LOAD_PAGE_ANCHOR = 'async function loadPage() {';

/** Result of edit #1 — `loadPage` with the `export` keyword added. */
export const QUICK_EDIT_LOAD_PAGE_EXPORTED = 'export async function loadPage() {';

/**
 * Literal anchor for edit #2 — the canonical standalone `loadPage();` call.
 * The `?quick-edit` branch is inserted immediately after it. Stable string
 * pinned by `quickEditAnchorMatch.test.ts`. DO NOT edit without bumping the
 * canonical fixture.
 */
export const QUICK_EDIT_BRANCH_ANCHOR = 'loadPage();';

/**
 * Idempotency marker for edit #2. Lets `installQuickEdit` detect "branch
 * already present" without relying on the boilerplate's own substrings
 * (which could legitimately appear elsewhere). Bookends the appended branch.
 */
export const QUICK_EDIT_BRANCH_MARKER = '// === Quick Edit dynamic import (Demo Builder) ===';

/**
 * The `?quick-edit` dynamic-import branch appended to `scripts/scripts.js`.
 *
 * Faithful to the documented standalone IIFE: when the URL carries a
 * `quick-edit` query param, dynamically import the Quick Edit module and run
 * its default export. No-op on every other page. Inserted right after the
 * existing `loadPage();` call so it composes with the export edit in a
 * single file write.
 */
const QUICK_EDIT_BRANCH = `

${QUICK_EDIT_BRANCH_MARKER}
(() => {
  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
  // eslint-disable-next-line import/no-cycle
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
})();
// === end Quick Edit dynamic import ===`;

/**
 * Net-new `tools/quick-edit/quick-edit.js` module body.
 *
 * Verbatim from Adobe's documented Quick Edit wiring (docs.da.live, Step 2).
 * Loads the da.live Quick Edit plugin on demand and hands it the storefront's
 * `loadPage` so it can re-render after edits. Brand-agnostic — derives the
 * mountpoint from the running hostname, so no per-storefront templating.
 */
export const QUICK_EDIT_JS = `// eslint-disable-next-line import/no-cycle
import { loadPage } from '../../scripts/scripts.js';

const importMap = {
  imports: {
    'da-lit': 'https://da.live/deps/lit/dist/index.js',
    'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
  },
};

function addImportmap() {
  const importmapEl = document.createElement('script');
  importmapEl.type = 'importmap';
  importmapEl.textContent = JSON.stringify(importMap);
  document.head.appendChild(importmapEl);
}

async function loadModule(origin, payload) {
  const { default: loadQuickEdit } = await import(\`\${origin}/nx/public/plugins/quick-edit/quick-edit.js\`);
  loadQuickEdit(payload, loadPage);
}

function generateSidekickPayload() {
  let { hostname } = window.location;
  if (hostname === 'localhost') {
    hostname = document.querySelector('meta[property="hlx:proxyUrl"]').content;
  }
  const parts = hostname.split('.')[0].split('--');
  const [, repo, owner] = parts;

  return {
    detail: {
      config: {
        mountpoint: \`https://content.da.live/\${owner}/\${repo}/\`,
      },
      location: {
        pathname: window.location.pathname,
      },
    },
  };
}

export default function init(payload) {
  const { search } = window.location;
  const ref = new URLSearchParams(search).get('quick-edit');
  let origin;
  if (ref === 'on' || !ref) origin = 'https://da.live';
  if (ref === 'local') origin = 'http://localhost:6456';
  if (!origin) origin = \`https://\${ref}--da-nx--adobe.aem.live\`;
  addImportmap();
  loadModule(origin, payload || generateSidekickPayload());
}
`;

/**
 * Commit message for the scripts.js transform.
 */
const SCRIPTS_COMMIT_MESSAGE = 'chore(demo-builder): wire Quick Edit into scripts/scripts.js';

/**
 * Commit message for the net-new quick-edit module.
 */
const QUICK_EDIT_JS_COMMIT_MESSAGE = 'chore(demo-builder): vendor tools/quick-edit/quick-edit.js';

/**
 * Outcome of a single install attempt. Mirrors `Pdp404InstallResult` —
 * surfaces in the pipeline log and is asserted by the tests.
 */
export interface QuickEditInstallResult {
    installed: boolean;
    /** Set when installed=false to explain why the step was skipped. */
    reason?: string;
}

/**
 * Apply both `scripts/scripts.js` edits to the existing file content.
 *
 * Pure transform (no I/O). First-match-only for each edit, like the patch
 * engine. Composes the two edits: adds `export` to `loadPage`, then appends
 * the `?quick-edit` dynamic-import branch after the standalone `loadPage();`
 * call.
 */
export function buildQuickEditScriptsJs(existing: string): string {
    const exported = existing.replace(
        QUICK_EDIT_LOAD_PAGE_ANCHOR,
        QUICK_EDIT_LOAD_PAGE_EXPORTED,
    );
    return exported.replace(
        QUICK_EDIT_BRANCH_ANCHOR,
        `${QUICK_EDIT_BRANCH_ANCHOR}${QUICK_EDIT_BRANCH}`,
    );
}

/**
 * Install Quick Edit for one storefront.
 *
 * Called from the two places that modify the storefront's GitHub repo —
 * `storefrontSetupPhase2.ts` (create/edit) and `edsResetRepoHelper.ts`
 * (reset) — alongside `installSmart404Handler`. Brand-agnostic: no overlay
 * or IMS inputs needed.
 *
 * Two sinks:
 *   1. `scripts/scripts.js` — transform (export + branch), SHA-aware commit.
 *      Idempotent: skips when the export AND branch marker are both already
 *      present.
 *   2. `tools/quick-edit/quick-edit.js` — net-new file. Idempotent: skips
 *      when the module already exists.
 *
 * Non-fatal at every step. Returns `{ installed: true }` when the scripts.js
 * edit lands (the load-bearing piece); `{ installed: false, reason }` when
 * it's skipped (missing file, absent anchor, already installed) or fails.
 * A failed `quick-edit.js` write degrades (Quick Edit won't load) but never
 * flips the result to failure on its own.
 */
export async function installQuickEdit(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<QuickEditInstallResult> {
    const result = await installQuickEditScripts(githubFileOps, repoOwner, repoName, logger);

    // Always attempt the net-new module — it's independent of the scripts.js
    // edit and non-fatal. (When scripts.js was skipped as "already installed"
    // the module is typically present too; the inner idempotency check makes
    // this a cheap no-op.)
    await installQuickEditModule(githubFileOps, repoOwner, repoName, logger);

    return result;
}

/**
 * Transform and commit `scripts/scripts.js`. Returns the load-bearing
 * result for the whole step.
 */
async function installQuickEditScripts(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<QuickEditInstallResult> {
    const existing = await githubFileOps.getFileContent(repoOwner, repoName, SCRIPTS_JS_PATH);
    if (!existing?.content) {
        logger.warn('[QuickEdit] scripts/scripts.js not found — skipping Quick Edit scripts wiring');
        return { installed: false, reason: 'scripts.js missing' };
    }

    const hasExport = existing.content.includes(QUICK_EDIT_LOAD_PAGE_EXPORTED);
    const hasBranch = existing.content.includes(QUICK_EDIT_BRANCH_MARKER);
    if (hasExport && hasBranch) {
        logger.info('[QuickEdit] scripts/scripts.js already wired — skipping');
        return { installed: false, reason: 'already installed' };
    }

    // The un-exported anchor must be present to add the export. If it's
    // absent (forked/unusual storefront) and the file isn't already
    // exported, we can't safely transform — skip rather than guess.
    if (!hasExport && !existing.content.includes(QUICK_EDIT_LOAD_PAGE_ANCHOR)) {
        logger.warn('[QuickEdit] loadPage anchor not found in scripts.js — skipping Quick Edit scripts wiring');
        return { installed: false, reason: 'loadPage anchor missing' };
    }

    const newContent = buildQuickEditScriptsJs(existing.content);

    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner, repoName, SCRIPTS_JS_PATH,
            newContent, SCRIPTS_COMMIT_MESSAGE, existing.sha,
        );
        logger.info(`[QuickEdit] Wired Quick Edit into scripts/scripts.js (${repoOwner}/${repoName})`);
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(`[QuickEdit] GitHub commit failed: ${reason} — skipping Quick Edit scripts wiring`);
        return { installed: false, reason: `GitHub commit failed: ${reason}` };
    }

    return { installed: true };
}

/**
 * Write the net-new `tools/quick-edit/quick-edit.js` module. Idempotent
 * (skips when present) and non-fatal (a failure degrades but never breaks
 * the storefront).
 */
async function installQuickEditModule(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<void> {
    const existing = await githubFileOps.getFileContent(repoOwner, repoName, QUICK_EDIT_JS_PATH);
    if (existing?.content) {
        logger.info('[QuickEdit] tools/quick-edit/quick-edit.js already present — skipping');
        return;
    }

    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner, repoName, QUICK_EDIT_JS_PATH,
            QUICK_EDIT_JS, QUICK_EDIT_JS_COMMIT_MESSAGE, existing?.sha,
        );
        logger.info(`[QuickEdit] Vendored tools/quick-edit/quick-edit.js (${repoOwner}/${repoName})`);
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(`[QuickEdit] quick-edit.js commit failed: ${reason} — Quick Edit module not installed`);
    }
}
