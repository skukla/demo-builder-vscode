/**
 * Shared harness for the `daLiveAuthPrompt` suite family.
 *
 * WHAT IS SHARED, AND WHAT DELIBERATELY IS NOT. Of the nine modules both suites
 * mock, seven are byte-identical boilerplate that exists only so the subject can
 * load — they move here. The other two do NOT, and that is a finding rather than
 * an omission:
 *
 *   `vscode` — the guard suite serves one queued `showInformationMessage` reply
 *     and an EMPTY clipboard, so the token step falls through to the paste box.
 *     The sign-in suite queues several replies, records the `showInputBox`
 *     options it was called with, and serves clipboard text. Same module, two
 *     different scripts for two different scenarios.
 *   `daLiveAuthService` — the guard suite needs `isServerAccepted` and `dispose`;
 *     the sign-in suite needs neither and pins `isAuthenticated` true.
 *
 * A shared factory for either would have to be the union, and each suite would
 * then re-script it per test — which is the duplication back again, in a less
 * obvious place. So they stay local, and this comment is why.
 *
 * The subject is re-exported from here, which is what lets the seven factories
 * live here at all: `jest.mock` hoists above the imports OF THIS MODULE, so the
 * subject must be imported here to bind to them. A spec's OWN `jest.mock` calls
 * still apply — they hoist to the top of the spec, which runs before it imports
 * this file. Verified by the two suites passing unchanged.
 *
 * @see tests/sop/test-family-setup.test.ts
 * @see .claude/skills/webview-test-authoring/ §3 (the hoisting rule)
 */

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import type { HandlerContext } from '@/types/handlers';

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

// SIX AUTOMOCKS USED TO SIT HERE, and both suites carried them:
//
//   githubTokenService · githubRepoOperations · githubFileOperations
//   githubOAuthService · daLiveOrgOperations · daLiveContentOperations
//
// Their comment said they existed "so daLiveAuthPrompt can load". Measured
// 2026-08-31, individually and then all six together: all 51 tests pass without
// any of them. The subject never reaches those modules. They were twelve dead
// lines duplicated across two files, and moving them here would have preserved
// the debt in a tidier place.
//
// `@/core/logging` above is the one that IS load-bearing — without it 14 tests
// fail, because `getLogger()` throws when the logger is uninitialised.

// Below the factories on purpose — they hoist above it, so the subject binds to
// the mocked modules. `import/first` is NOT a registered eslint rule here; do not
// add a disable comment, that itself errors as an unknown rule.
export {
    ensureDaLiveAuth,
    showDaLiveAuthQuickPick,
    type DaLiveGuardResult,
} from '@/features/eds/handlers/daLive/daLiveAuthPrompt';
export { clearServiceCache } from '@/features/eds/handlers/edsServiceCache';

/**
 * A handler context for the auth-prompt suites.
 *
 * CONTENT over a canonical SHAPE (ADR-016 rule 3b): the shape comes from
 * `createMockHandlerContext`, and only what this subject actually needs is
 * overridden. Both suites previously carried their own 26-line `createMockContext`
 * — the same name PL-16 measured as defined ten times across six return types.
 *
 * The two overrides, each because the canonical default is wrong for this path:
 *   `panel` — the canonical default is `undefined`; these handlers post to the
 *     webview, so it needs one.
 *   `globalState.get` — the canonical default returns `true` (one-time tip
 *     already shown, so tips stay out of the way). These suites drive the tip
 *     path, so it returns undefined here.
 */
export function createAuthPromptContext(): HandlerContext {
    return createMockHandlerContext({
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            loadProjectFromPath: jest.fn(),
            getCurrentProject: jest.fn(),
        } as unknown as HandlerContext['stateManager'],
        context: {
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as unknown as HandlerContext['context'],
        sharedState: {
            isAuthenticating: false,
        } as unknown as HandlerContext['sharedState'],
    });
}
