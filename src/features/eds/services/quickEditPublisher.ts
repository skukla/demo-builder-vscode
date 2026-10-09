/**
 * Quick Edit vendoring step — Experience Workspace (EW) WYSIWYG wiring.
 *
 * Vendors da.live's Quick Edit dependency into every EDS storefront so the
 * EW "Layout" (WYSIWYG) view can invoke it: four surgical edits to
 * `scripts/scripts.js` plus one net-new module file. Inert under Universal
 * Editor (the Sidekick `quick-edit` plugin — registered separately in the
 * Config Service template — only fires under EW), so this runs for ALL EDS
 * projects at create AND reset, idempotently.
 *
 * This file is the installer: it reads each file from the storefront's GitHub
 * repo, decides whether it needs the edit, and commits it. The text it writes
 * — anchors, markers, inserted blocks, the module body and the transform —
 * lives in `quickEditSnippet.ts`.
 *
 * Modeled exactly on `pdp404HandlerPublisher`:
 *   - `GitHubFileOperations.getFileContent` → idempotent marker check →
 *     `createOrUpdateFile` (SHA-aware).
 *   - Non-fatal at every step: any failure logs and returns
 *     `{ installed: false, reason }`. Never throws. The storefront still
 *     works without Quick Edit — it just can't enter the WYSIWYG view.
 *
 * The Sidekick `quick-edit` plugin entry (the Config-Service half of the
 * wiring) lives in `config-template.json` — see Step 2.
 *
 * @module features/eds/services/quickEditPublisher
 */

import { GitHubFileOperations } from './github/githubFileOperations';
import {
    QUICK_EDIT_BRANCH_MARKER,
    QUICK_EDIT_FIRSTIMAGE_MARKER,
    QUICK_EDIT_JS,
    QUICK_EDIT_LOAD_PAGE_ANCHOR,
    QUICK_EDIT_LOAD_PAGE_EXPORTED,
    QUICK_EDIT_SIDEKICK_MARKER,
    buildQuickEditScriptsJs,
} from './quickEditSnippet';
import type { Logger } from '@/types/logger';

/** Storefront-relative path to the canonical entry script. */
export const SCRIPTS_JS_PATH = 'scripts/scripts.js';

/** Storefront-relative path to the net-new Quick Edit module. */
export const QUICK_EDIT_JS_PATH = 'tools/quick-edit/quick-edit.js';

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

    // "Already installed" requires ALL FOUR edits. A repo vendored before the
    // first-paint guard shipped has the export + IIFE branch + Sidekick
    // listener but NOT the guard — re-running adds just the guard
    // (buildQuickEditScriptsJs is per-edit idempotent), repairing the EW
    // first-paint stall. (Same shape as the earlier Sidekick-listener repair.)
    const hasExport = existing.content.includes(QUICK_EDIT_LOAD_PAGE_EXPORTED);
    const hasBranch = existing.content.includes(QUICK_EDIT_BRANCH_MARKER);
    const hasSidekick = existing.content.includes(QUICK_EDIT_SIDEKICK_MARKER);
    const hasFirstImageGuard = existing.content.includes(QUICK_EDIT_FIRSTIMAGE_MARKER);
    if (hasExport && hasBranch && hasSidekick && hasFirstImageGuard) {
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
