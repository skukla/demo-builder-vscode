/**
 * demo-source on-open check: is the added demo this project was built on
 * still there? Read-only (P1): one repository read and one GET of the content
 * index, both through {@link checkDemoSource}, which reset's own door uses.
 * A renamed repository is followed there and saved, so the dashboard and the
 * reset door can never disagree about where the demo is.
 *
 * `warning` carries the sentence the notice shows ("Jen's demo can't be
 * reached. Reset and updates are unavailable until it is.", or the content
 * site's own line). `ok` for a project with no added demo, so the notice never
 * appears for a shipped brand. Re-runnable: "Change source" re-requests status
 * to clear it.
 *
 * @module features/dashboard/services/onOpenChecks/demoSourceCheck
 */

import type { CheckResult, OnOpenCheck, OnOpenCheckContext } from './types';
import type { GitHubRepoOperations } from '@/features/eds/services/github/githubRepoOperations';
import { checkDemoSource } from '@/features/eds/services/reset/demoSourceCheck';
import { CHECK_IDS } from '@/types/messages';
import type { StateManager } from '@/types/state';

/** Payload the webview routes from a `checkResult{demo-source}`. */
export interface DemoSourceCheckData {
    demoName: string;
    /** The repository does not answer (reset and updates refuse). */
    unreachable: boolean;
    /** The content site publishes no index (reset offers to keep current content). */
    contentUnreachable: boolean;
}

export interface DemoSourceCheckDeps {
    /** Resolved lazily: built from the context's secrets at run time. */
    repoOperations: () => Pick<GitHubRepoOperations, 'getRepository'>;
    /** Resolved lazily, as the org check's is; a followed rename is saved through it. */
    stateManager: () => Pick<StateManager, 'saveProject'> | null | undefined;
    fetchImpl?: typeof fetch;
}

const NO_SAVE: Pick<StateManager, 'saveProject'> = { saveProject: async () => undefined };

export function createDemoSourceCheck(deps: DemoSourceCheckDeps): OnOpenCheck {
    return {
        id: CHECK_IDS.DEMO_SOURCE,
        mode: 'background',
        reRunnable: true,
        async run(ctx: OnOpenCheckContext): Promise<CheckResult<DemoSourceCheckData>> {
            const { project, logger } = ctx;
            if (!project.demo) return { status: 'ok' };

            const check = await checkDemoSource(
                project,
                deps.repoOperations(),
                { logger, stateManager: deps.stateManager() ?? NO_SAVE },
                deps.fetchImpl,
            );
            const data: DemoSourceCheckData = {
                demoName: project.demo.name,
                unreachable: !check.reachable,
                contentUnreachable: !check.contentReachable,
            };
            if (!check.reachable) {
                return { status: 'warning', message: check.message, data };
            }
            if (!check.contentReachable) {
                return { status: 'warning', message: check.contentMessage, data };
            }
            return { status: 'ok', data };
        },
    };
}
