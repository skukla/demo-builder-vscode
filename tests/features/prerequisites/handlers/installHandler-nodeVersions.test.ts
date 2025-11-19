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
jest.mock('@/features/prerequisites/handlers/shared');
jest.mock('@/core/di');
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ url })),
    },
}));
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockNodePrereq,
    mockNpmPrereq,
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - Node Versions Parameter Passing', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createMockContext();
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
});
