/**
 * Install Handler Tests - Edge Cases
 *
 * Tests boundary conditions and unusual scenarios including:
 * - No version specified for single-version install
 * - Node versions empty array
 * - Per-node prerequisite with no Node versions installed
 * - Per-node prerequisite partially installed
 * - Install steps empty array
 * - Default steps empty array
 * - Version templating with no version
 * - Verification succeeds but shows not installed
 * - Multi-version with some already installed
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
    mockAdobeCliPrereq,
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - Edge Cases', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createMockContext();
    });

    it('should handle no version specified for single-version install', async () => {
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Should not use version templating
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            undefined
        );
    });

    it('should handle Node versions empty array', async () => {
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([]);
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        // Should use provided version as fallback
        expect(result.success).toBe(true);
    });

    it('should handle per-node prerequisite with no Node versions installed', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        // Mock getRequiredNodeVersions to return empty array (no Node versions available)
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([]);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Should return early with no versions to install
        expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
    });

    it('should handle per-node prerequisite partially installed', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // Mock checkPerNodeVersionStatus to return Node 18 installed, Node 20 not installed
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Should only install for Node 20 (1 step)
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
    });

    it('should handle install steps empty array', async () => {
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({ steps: [] });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
    });

    it('should handle default steps empty array', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: false },
            { version: 'Node 20', component: 'v20.0.0', installed: true },
        ]);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Should only run install step for Node 18, no default steps
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
    });

    it('should handle version templating with no version', async () => {
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install {version}', message: 'Installing {version}...', command: 'install command' },
            ],
        });

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Should not replace {version} template
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Install {version}' }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            undefined
        );
    });

    it('should handle verification succeeds but shows not installed', async () => {
        const notInstalledResult = {
            ...mockNodeResult,
            installed: false,
        };
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(notInstalledResult);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'error',
                installed: false,
                canInstall: true,
            })
        );
    });

    it('should handle multi-version with some already installed', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: true },
            { version: 'Node 20', component: 'v20.0.0', installed: false },
        ]);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Should only install Node 20, not Node 18
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
    });
});
