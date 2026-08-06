/**
 * On-open check orchestrator.
 *
 * Runs the registered automatic on-open checks concurrently, posting each one's
 * outcome on the single `checkResult` webview channel. Enforces the two
 * principles (see {@link ./types}):
 *   - P2: a check that throws becomes a posted `error` outcome — never an
 *     unhandled rejection, never silent.
 *   - EDS gate + per-session re-entrancy guard so a re-`requestStatus` doesn't
 *     re-run a check.
 *
 * The core is vscode-free (deps injected) so it's fully unit-testable.
 *
 * @module features/dashboard/services/onOpenChecks/orchestrator
 */

import type { CheckResult, OnOpenCheck, RunOnOpenChecksDeps } from './types';
import { CHECK_RESULT_MESSAGE } from '@/types/messages';

/** Per-session guard: `${project.path}::${checkId}` already run this session. */
const ranThisSession = new Set<string>();

/**
 * Re-arm every guarded check for one project — call when its dashboard is OPENED.
 *
 * The guard exists to dedupe a re-`requestStatus` within one dashboard mount (the
 * Integrations refresh button). It must NOT outlive the mount: leaving a project and
 * returning remounts the webview, which resets the state these checks feed. Without
 * this, the second visit skipped `ai-verify`, the badge sat on "Verifying" forever,
 * and the AI Capabilities modal reported "No MCP servers wired yet / No skills yet"
 * for a project whose files were fine — null rendered as emptiness.
 *
 * Scoped to one project on purpose: switching projects must not silently re-run
 * every other project's checks.
 *
 * @param projectPath - the project whose dashboard is being opened
 */
export function armOnOpenChecks(projectPath: string): void {
    const prefix = `${projectPath}::`;
    for (const key of ranThisSession) {
        if (key.startsWith(prefix)) ranThisSession.delete(key);
    }
}

/** Test helper: reset the re-entrancy guard between tests. Not part of the production API. */
export function _resetOnOpenChecksGuardForTests(): void {
    ranThisSession.clear();
}

/**
 * VS Code throws "Webview is disposed" from postMessage/.visible once a panel is
 * gone. Matched on the message because the API surfaces no typed error for it.
 */
function isDisposedPanelError(message: string): boolean {
    return message.toLowerCase().includes('webview is disposed');
}

/**
 * Run the given on-open checks for a project. Fire-and-forget from the caller
 * (`void runOnOpenChecks(...)`); resolves once all checks settle.
 *
 * @param deps - project, logger, isEds gate, and the `postMessage` sink
 * @param checks - the checks to run (the registry)
 */
export async function runOnOpenChecks(
    deps: RunOnOpenChecksDeps,
    checks: OnOpenCheck[],
): Promise<void> {
    const { project, logger, isEds, postMessage } = deps;

    const runOne = async (check: OnOpenCheck): Promise<void> => {
        if (check.edsOnly && !isEds) return; // gated out — no run, no post

        // Re-entrancy: run a check at most once per session, UNLESS it opts out via
        // `reRunnable` (a live check that must re-run on every requestStatus — e.g.
        // org-context after a forced Switch IMS Org / re-auth).
        if (!check.reRunnable) {
            const guardKey = `${project.path}::${check.id}`;
            if (ranThisSession.has(guardKey)) return;
            ranThisSession.add(guardKey);
        }

        // The orchestrator owns identity: stamp `checkId` from `check.id` here, the
        // single place it's set, so checks return bare {status, message?, data?}.
        const post = (outcome: CheckResult): void => {
            postMessage(CHECK_RESULT_MESSAGE, { ...outcome, checkId: check.id });
        };

        try {
            const outcome = await check.run({ project, logger, post });
            post(outcome);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A disposed panel is NOT a check failure — it means the user navigated
            // away while a slow check (auth + org fetch runs ~4-6s) was still in
            // flight. Common since the dashboard ⇄ integrations swap disposes the
            // sibling panel. Reporting it as an error logged a warning about
            // nothing and then tried to post the outcome to the very panel that
            // had just gone away.
            if (isDisposedPanelError(message)) {
                logger.debug(`[OnOpenChecks] '${check.id}' abandoned — panel closed mid-check`);
                return;
            }
            // P2: a throw never escapes and never goes silent — surface it as an
            // error outcome on the same channel.
            logger.warn(`[OnOpenChecks] '${check.id}' failed: ${message}`);
            post({ status: 'error', message });
        }
    };

    await Promise.allSettled(checks.map(runOne));
}
