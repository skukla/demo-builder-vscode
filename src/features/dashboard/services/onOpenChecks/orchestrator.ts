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

/** Test helper: reset the re-entrancy guard between tests. Not part of the production API. */
export function _resetOnOpenChecksGuardForTests(): void {
    ranThisSession.clear();
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
            // P2: a throw never escapes and never goes silent — surface it as an
            // error outcome on the same channel.
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`[OnOpenChecks] '${check.id}' failed: ${message}`);
            post({ status: 'error', message });
        }
    };

    await Promise.allSettled(checks.map(runOne));
}
