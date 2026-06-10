/**
 * Regression — prerequisite check honors the user's optional dependency picks.
 *
 * Before the fix, `initializePrerequisiteCheck` built the component selection
 * from `stack.dependencies + stack.optionalDependencies`, slamming all stack
 * optional deps (including `eds-accs-mesh`) into the selection regardless of
 * what the user actually configured. The stale comment claimed this was because
 * "prerequisites run before the Architecture Modal" — but the modal moved into
 * WelcomeStep, so by the time prereqs run, the user has already made a real
 * choice. The handler was overriding it.
 *
 * Field repro: a CitiSignal + EDS+ACCS demo (no mesh) had `eds-accs-mesh`
 * appear in `currentComponentSelection.dependencies` at prereq-check time,
 * which made downstream code treat the project as App-Builder-requiring.
 *
 * This test pins the new contract: the handler builds the component selection
 * from `stack.dependencies + payload.selectedOptionalDependencies`. When the
 * user opted in to mesh, it appears. When they didn't, it doesn't.
 */

jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getNodeVersionMapping: jest.fn(),
        getNodeVersionIdMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        areDependenciesInstalled: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
        getPluginNodeVersions: jest.fn(),
    };
});

jest.mock('@/types/typeGuards', () => ({
    toError: (error: any) => (error instanceof Error ? error : new Error(String(error))),
    isTimeoutError: (error: any) => error?.message?.includes('timeout'),
}));

import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import {
    createMockContext,
    setupStandardMocks,
    cleanupTests,
} from './checkHandler.testUtils';

describe('handleCheckPrerequisites — user optional-dependency picks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupStandardMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    it('omits mesh from currentComponentSelection.dependencies when the user did NOT opt in', async () => {
        // Repro of Leah's field case: CitiSignal + EDS+ACCS, no mesh selected.
        // The eds-accs stack has eds-accs-mesh in optionalDependencies, but
        // the user left it unchecked, so selectedOptionalDependencies is [].
        const context = createMockContext();

        await handleCheckPrerequisites(context, {
            selectedStack: 'eds-accs',
            selectedOptionalDependencies: [],
        });

        expect(context.sharedState.currentComponentSelection).toBeDefined();
        expect(context.sharedState.currentComponentSelection?.dependencies).not.toContain('eds-accs-mesh');
    });

    it('includes mesh in currentComponentSelection.dependencies when the user opted in', async () => {
        // Same stack (eds-accs), but the user explicitly toggled mesh on in the
        // Architecture Modal — so it appears in selectedOptionalDependencies.
        const context = createMockContext();

        await handleCheckPrerequisites(context, {
            selectedStack: 'eds-accs',
            selectedOptionalDependencies: ['eds-accs-mesh'],
        });

        expect(context.sharedState.currentComponentSelection?.dependencies).toContain('eds-accs-mesh');
    });

    it('defaults to [] when payload omits selectedOptionalDependencies (back-compat)', async () => {
        // Some callers (older code paths, edit mode, etc.) may not send the new
        // field. Treat absence as "no opt-in" rather than "all opt-ins" — that
        // matches the safer interpretation and avoids the original bug.
        const context = createMockContext();

        await handleCheckPrerequisites(context, {
            selectedStack: 'eds-accs',
        });

        expect(context.sharedState.currentComponentSelection?.dependencies).not.toContain('eds-accs-mesh');
    });
});
