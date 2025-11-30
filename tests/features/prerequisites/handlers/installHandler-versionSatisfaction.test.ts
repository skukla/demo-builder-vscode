/**
 * Install Handler Tests - Version Satisfaction
 *
 * Tests version satisfaction checks (Step 3 implementation).
 * Determines if an installed version satisfies the requirement (e.g., 24.0.10 satisfies 24.x).
 *
 * Tests include:
 * - Skip installation when version family is satisfied
 * - Proceed with installation when version not satisfied
 * - Check satisfaction for all required versions
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
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - Version Satisfaction', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createMockContext();
    });

    it('should skip installation when version family is satisfied', async () => {
        // Given: Node 24.0.10 installed, user selects 24.x
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Mock checkVersionSatisfaction to return true
        (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock) = jest.fn().mockResolvedValue(true);

        // When: Install requested for Node 24
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

        // Then: Skips installation, returns success
        expect(result.success).toBe(true);
        expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
        expect(mockContext.prereqManager!.checkVersionSatisfaction).toHaveBeenCalledWith('24');
    });

    it('should proceed with installation when version not satisfied', async () => {
        // Given: Node 18.x installed, user selects 24.x
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Mock checkVersionSatisfaction to return false
        (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock) = jest.fn().mockResolvedValue(false);
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 24', component: 'v24.0.0', installed: false },
        ]);

        // When: Install requested for Node 24
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

        // Then: Proceeds with installation
        expect(result.success).toBe(true);
        expect(mockContext.prereqManager!.checkVersionSatisfaction).toHaveBeenCalledWith('24');
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalled();
    });

    it('should check satisfaction for all required versions', async () => {
        // Given: Node prerequisite with multiple versions required
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        // Mock different required versions
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20', '24']);
        // CRITICAL: Mock mapping for all three versions (implementation needs this to filter)
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
            '18': 'React App',
            '20': 'Node Backend',
            '24': 'Latest Features',
        });
        (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock) = jest.fn()
            .mockResolvedValueOnce(true)  // 18 satisfied
            .mockResolvedValueOnce(true)  // 20 satisfied
            .mockResolvedValueOnce(false); // 24 not satisfied

        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: true },
            { version: 'Node 20', component: 'v20.0.0', installed: true },
            { version: 'Node 24', component: 'v24.0.0', installed: false },
        ]);

        // When: Install requested without specific version
        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: Only installs version 24 (since 18 and 20 are already installed)
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
    });
});
