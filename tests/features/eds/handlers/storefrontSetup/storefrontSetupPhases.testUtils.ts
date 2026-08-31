/**
 * Shared harness for the `storefrontSetupPhases` suite family (4 suites).
 *
 * NINETEEN DEAD MOCK DECLARATIONS came out of these four files first, measured
 * 2026-08-31 by deleting each and re-running — individually, then all five modules
 * together:
 *
 *   vscode                    DEAD in three (jest.config.js already maps it)
 *   githubTokenService        DEAD in all four
 *   fstabGenerator            DEAD in all four
 *   daLiveAuthService         DEAD in all four
 *   daLiveContentOperations   DEAD in all four
 *
 * WHAT IS LEFT IS LOAD-BEARING, and most of it still cannot move:
 *
 *   @/core/logging            NEEDED (34 fail) — moved HERE
 *   githubFileOperations      NEEDED (30 fail) — moved HERE
 *   timeoutConfig             NEEDED (9 fail)  — 3 variants, stays local
 *   githubRepoOperations      NEEDED           — 2 variants, stays local
 *   blockLibraryLoader        NEEDED (6 fail)  — SPEC-imported, cannot move
 *   blockCollectionHelpers    NEEDED (6 fail)  — SPEC-imported, cannot move
 *   edsPipeline               NEEDED (12 fail) — SPEC-imported, cannot move
 *   edsHelpers                NEEDED           — SPEC-imported, cannot move
 *
 * "SPEC-imported, cannot move" is the rule the deployMesh family taught by failing
 * 23 tests: a `jest.mock` only hoists above the imports of the module it appears in,
 * so a mock for something the SPEC itself imports has to stay in that spec. Four of
 * these are in that position, which is why this harness is smaller than the raw
 * duplication count suggests.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: jest.fn().mockResolvedValue(null),
        createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
    })),
}));

// Below the factories on purpose — they hoist above it, so the subject binds to the
// mocked modules. `import/first` is not a registered eslint rule here.
export { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhases';

/**
 * A handler context for storefront setup.
 *
 * CONTENT over a canonical SHAPE (ADR-016 rule 3b). All four suites carried their
 * own 24-line `createMockContext` — the same name PL-16 measured as defined ten
 * times across six return types, and the second family in this batch to have its
 * own copy. The shape now comes from `createMockHandlerContext`; only what setup
 * genuinely needs differently is overridden.
 *
 * The three overrides, each because the canonical default is wrong here:
 *   `panel`       — canonical default is undefined; these phases post progress to
 *                   the webview.
 *   `authManager` — setup checks Adobe auth and reads a token; the canonical
 *                   default is an empty object.
 *   `sharedState` — present and empty, which is what the phases expect.
 */
export function createSetupContext(
    /**
     * What `stateManager.getCurrentProject` resolves.
     *
     * Defaults to `undefined`, which is what three of the four suites had. The
     * tracking suite needs a real one — its subject saves installed-library metadata
     * back onto the current project, so with no project the save path never runs and
     * its assertions silently see zero calls. That is exactly what happened when this
     * parameter did not exist: two tests failed against a shared context that was
     * correct for the other three suites.
     */
    currentProject?: unknown,
): HandlerContext {
    return createMockHandlerContext({
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(currentProject),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }) as unknown as HandlerContext['stateManager'],
        context: {
            secrets: {},
            globalState: { get: jest.fn(), update: jest.fn() },
        } as unknown as HandlerContext['context'],
        sharedState: {} as unknown as HandlerContext['sharedState'],
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            }),
        } as unknown as HandlerContext['authManager'],
    });
}
