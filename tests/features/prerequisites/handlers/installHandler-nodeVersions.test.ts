/**
 * Install Handler Tests - Node Versions Parameter Passing
 *
 * Tests the nodeVersions array parameter passing for Node.js installation.
 * Covers Step 1 Bug Fix for proper version filtering and parameter passing.
 *
 * Tests include:
 * - Pass nodeVersions array for Node.js when multiple versions required
 * - Handle version parameter override for Node.js
 * - Return early when Node.js has no required versions
 * - Not pass nodeVersions for non-Node prerequisites
 */

// Mock all dependencies (MUST be at top before imports)
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getRequiredNodeVersions: jest.fn(),
        getNodeVersionMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
    };
});
jest.mock('@/core/di/serviceLocator');
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ url })),
    },
}));

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockNodePrereq,
    mockNpmPrereq,
    mockAdobeCliPrereq,
    mockNodeResult,
    createInstallHandlerContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - Node Versions Parameter Passing', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createInstallHandlerContext();
    });

    it('should pass nodeVersions array for Node.js when multiple versions required', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Mock checkMultipleNodeVersions to show versions 18 and 20 are NOT installed
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.20.8', installed: false },
            { version: 'Node 20', component: 'v20.19.5', installed: false },
        ]);

        // Spy on getInstallSteps to verify parameters
        const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Verify nodeVersions array contains ONLY missing versions (18 and 20)
        expect(getInstallStepsSpy).toHaveBeenCalledWith(
            mockNodePrereq,
            expect.objectContaining({
                nodeVersions: ['18', '20']  // Only missing versions passed after filtering
            })
        );
    });

    it('should handle version parameter override for Node.js', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

        await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

        // When version specified, should pass that version
        expect(getInstallStepsSpy).toHaveBeenCalledWith(
            mockNodePrereq,
            expect.objectContaining({
                nodeVersions: ['24']
            })
        );
    });

    it('should return early when Node.js has no required versions', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Mock empty required versions - use mockResolvedValueOnce to override global mock
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValueOnce([]);

        // Mock empty mapping (no components requiring Node versions)
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValueOnce({});

        // Mock checkMultipleNodeVersions returns empty array (no versions to check)
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValueOnce([]);

        const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Should return early without calling getInstallSteps when no versions need installation
        expect(result.success).toBe(true);
        expect(getInstallStepsSpy).not.toHaveBeenCalled();
    });

    it('should not pass nodeVersions for non-Node prerequisites', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNpmPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // npm should not receive nodeVersions parameter
        expect(getInstallStepsSpy).toHaveBeenCalledWith(
            mockNpmPrereq,
            expect.objectContaining({
                nodeVersions: undefined
            })
        );
    });

    /**
     * WHICH Node versions a per-version tool installs for when NOTHING requires one.
     *
     * `installHandler.ts:72` and `:142` both answer it, with the same expression
     * written twice: `nodeVersions.length ? nodeVersions : [version || '20']`. Both
     * were unconstrained — six mutants between them — because the shared setup always
     * returns `['18', '20']`, so the empty case never ran in any test.
     *
     * The rule: with no Node version required by the project, fall back to the version
     * the caller asked for, or to Node 20. Get it wrong and the tool installs against a
     * runtime the user never chose — silently, since the install still succeeds.
     *
     * These assert the ARGUMENT handed to the collaborator rather than the outcome:
     * the version list IS the decision, and an outcome assertion would pass whatever
     * list was used.
     */
    describe('the default Node version when the project requires none', () => {
        function usePerNodeWithNoRequiredVersions() {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([]);
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
                perNodeVersionStatus: [],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20'],
            });
        }

        it('falls back to Node 20 when the caller names no version either', async () => {
            usePerNodeWithNoRequiredVersions();

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledWith(
                mockAdobeCliPrereq,
                ['20'],
                mockContext
            );
            // The SECOND copy of the same decision, read by the install planner.
            expect(mockContext.prereqManager?.getInstallSteps).toHaveBeenCalledWith(
                mockAdobeCliPrereq,
                { nodeVersions: ['20'] }
            );
        });

        it('uses the version the caller named, not the default', async () => {
            usePerNodeWithNoRequiredVersions();

            await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '22' });

            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledWith(
                mockAdobeCliPrereq,
                ['22'],
                mockContext
            );
            expect(mockContext.prereqManager?.getInstallSteps).toHaveBeenCalledWith(
                mockAdobeCliPrereq,
                { nodeVersions: ['22'] }
            );
        });

        it('uses the required versions when the project HAS them, ignoring the default', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20']);
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
                perNodeVersionStatus: [],
                perNodeVariantMissing: true,
                missingVariantMajors: ['18'],
            });

            await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '22' });

            // The named version must NOT win here: the project's requirements do.
            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledWith(
                mockAdobeCliPrereq,
                ['18', '20'],
                mockContext
            );
            expect(mockContext.prereqManager?.getInstallSteps).toHaveBeenCalledWith(
                mockAdobeCliPrereq,
                { nodeVersions: ['18', '20'] }
            );
        });
    });

});
