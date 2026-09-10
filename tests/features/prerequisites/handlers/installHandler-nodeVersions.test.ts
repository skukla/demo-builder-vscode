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

// Registers the shared module wall — must precede every other import here.
import './installHandler.mocks';

// Mock all dependencies (MUST be at top before imports)

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

    /**
     * NODE VERSIONS ARE SORTED AS NUMBERS, NOT AS TEXT.
     *
     * As text, Node 8 sorts after Node 20 and Node 10 sorts before both. That order
     * reaches the user twice: it is the order versions are installed in, and the last
     * version in the list is the one made the default. So a text sort quietly makes the
     * wrong Node version the system default.
     *
     * Two separate sorts do this, written out twice (installHandler.ts:118 and :143).
     * Neither was constrained, because the shared test setup hands back keys that are
     * already in numeric order — so the sort could be deleted with nothing failing.
     * These tests hand back UNSORTED input, which is what production actually gets.
     */
    describe('ordering Node versions as numbers rather than as text', () => {
        const OUT_OF_ORDER = ['20', '8', '10'];
        const NUMERIC = ['8', '10', '20'];

        it('sorts the versions a per-version tool is checked against', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([...OUT_OF_ORDER]);
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
                perNodeVersionStatus: [],
                perNodeVariantMissing: true,
                missingVariantMajors: ['8'],
            });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledWith(
                mockAdobeCliPrereq,
                NUMERIC,
                mockContext
            );
        });

        it('sorts the missing Node versions before installing them', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            // Keys in the order the mapping happens to hold them — production does not
            // promise numeric order here, which is why the handler sorts.
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
                '20': 'A', '8': 'B', '10': 'C',
            });
            (shared.getNodeVersionKeys as jest.Mock).mockReturnValue([...OUT_OF_ORDER]);
            (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue(
                OUT_OF_ORDER.map((m) => ({
                    version: `Node ${m}`,
                    component: 'not installed',
                    installed: false,
                }))
            );

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(mockContext.prereqManager?.getInstallSteps).toHaveBeenCalledWith(
                mockNodePrereq,
                { nodeVersions: NUMERIC }
            );
        });
    });

});
