/**
 * Shared harness for the `edsResetService` suite family (5 suites).
 *
 * FORTY-FOUR DEAD MOCK DECLARATIONS came out of these five files first, measured
 * 2026-08-31 by deleting each module and re-running — individually, then all eleven
 * together. Every one of these was mocked in three to five of the suites and none of
 * them holds anything up:
 *
 *   vscode · @/core/constants · fstabGenerator · configGenerator
 *   daLiveContentOperations · storefrontStalenessDetector · stalenessDetector
 *   inspectorHelpers · @/core/di · @/types/typeGuards · daLiveAuthService
 *
 * WHAT IS LEFT IS LOAD-BEARING, and none of it can move here:
 *
 *   edsHelpers            NEEDED (all 28 fail) — SPEC-imported, 5 variants
 *   edsPipeline           NEEDED (13 fail)     — 3 variants
 *   adobeAuthGuard        NEEDED (7 fail)      — 2 variants
 *   timeoutConfig         NEEDED (2 fail)      — 3 variants
 *   blockLibraryLoader    NEEDED (2 fail)      — SPEC-imported
 *   blockCollectionHelpers NEEDED (2 fail)     — SPEC-imported
 *
 * So this harness owns NO mocks, which is unusual and worth stating rather than
 * leaving to look like an omission. Three of the six are SPEC-imported, and a
 * `jest.mock` only hoists above the imports of the module it appears in — the rule
 * the deployMesh family taught by failing 23 tests. The other three exist in two to
 * five different spellings because each suite scripts a different return for the
 * scenario it drives; a shared union would be re-scripted by every test.
 *
 * What it owns instead is the FIXTURES: the mesh deps fake every suite built its own
 * const for, the reset-target project, and a handler context that was written out
 * three different ways.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

export { createMeshDepsFake };

/**
 * The mesh dependency bundle every suite passes to `executeEdsReset`.
 *
 * All five declared `const meshDeps = createMeshDepsFake()` separately. The fake
 * itself was already canonical (PL-16 consolidated eleven hand-rolled copies into
 * `tests/helpers/meshDepsFake`); this removes the last five declarations of it.
 */
export const meshDeps = createMeshDepsFake();

/**
 * A handler context for a reset.
 *
 * CONTENT over a canonical SHAPE (ADR-016 rule 3b). Four suites carried a
 * `createMockContext` in THREE different spellings, differing in exactly three
 * things: what `getCurrentProject` resolves, whether `authManager` was present and in
 * which of two shapes, and whether `context.globalState` existed.
 *
 * This is the union of all three, which is safe here because nothing in the reset
 * path branches on the ABSENCE of those fields — verified by the family passing
 * unchanged, 28 names diffed. `currentProject` stays a parameter because suites
 * genuinely differ on it: one resolves a project, one resolves null, one leaves it
 * undefined, and those are different scenarios rather than different spellings.
 */
export function createResetContext(currentProject?: Project | null): HandlerContext {
    return createMockHandlerContext({
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(currentProject),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
        context: {
            secrets: {},
            globalState: { get: jest.fn(), update: jest.fn() },
        } as unknown as HandlerContext['context'],
        sharedState: {} as unknown as HandlerContext['sharedState'],
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            }),
        } as unknown as HandlerContext['authManager'],
    });
}

/**
 * The `executeEdsReset` parameters seven call sites across this family repeat.
 *
 * The six identifier fields never vary; only `project` and `redeployMesh` do
 * (counted 2026-09-02: four sites pass redeployMesh true, two omit it, one
 * passes false). None of those tests is asserting on the owner or template
 * names — they are there so the call is well-formed.
 *
 * @param project - the project under reset
 * @param overrides - anything this call needs beyond the defaults
 */
export function resetParams(
    project: Project,
    overrides: Record<string, unknown> = {}
): Parameters<typeof import('@/features/eds/services/reset/edsResetService').executeEdsReset>[0] {
    return {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-repo',
        templateOwner: 'template-owner',
        templateRepo: 'template-repo',
        project,
        ...overrides,
    } as Parameters<
        typeof import('@/features/eds/services/reset/edsResetService').executeEdsReset
    >[0];
}
