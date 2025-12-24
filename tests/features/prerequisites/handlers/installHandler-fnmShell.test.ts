/**
 * Install Handler Tests - FNM Shell Options
 *
 * Tests integration with checkPerNodeVersionStatus for fnm list shell options.
 * The actual fnm list shell option behavior is tested in shared-per-node-status.test.ts
 *
 * Tests include:
 * - Execute fnm list with shell option
 * - Successfully detect installed Node versions with shell context
 * - Handle fnm list failure gracefully
 * - Detect partial installation correctly
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
    mockAdobeCliPrereq,
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - FNM Shell Options', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createMockContext();
    });

    it('should execute fnm list with shell option', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // Mock checkPerNodeVersionStatus to return all installed (no installation needed)
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Verify checkPerNodeVersionStatus was called (which internally uses shell option for fnm list)
        expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
    });

    it('should successfully detect installed Node versions with shell context', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // Mock checkPerNodeVersionStatus to return all installed
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
    });

    it('should handle fnm list failure gracefully', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // Mock checkPerNodeVersionStatus to throw ENOENT error (fnm list failure)
        const enoentError: NodeJS.ErrnoException = new Error('spawn fnm ENOENT');
        enoentError.code = 'ENOENT';
        (shared.checkPerNodeVersionStatus as jest.Mock).mockRejectedValueOnce(enoentError);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
    });

    it('should detect partial installation correctly', async () => {
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
        expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
    });

    it('should install Adobe CLI for multiple missing versions in sorted order', async () => {
        // Given: Adobe CLI is NOT installed for Node 18 and 20 (in fnm)
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // Missing for versions 20, 18 (unsorted order) - matches fnm list which has 18 and 20
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 20', major: '20', component: '', installed: false },
                { version: 'Node 18', major: '18', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20', '18'], // Unsorted
        });

        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20']);

        const executedVersions: string[] = [];
        (mockContext.progressUnifier!.executeStep as jest.Mock).mockImplementation(
            async (step: any, current: number, total: number, callback: any, options?: any) => {
                if (options?.nodeVersion) {
                    executedVersions.push(options.nodeVersion);
                }
                await callback?.({ current: current + 1, total, message: step.message });
            }
        );

        // When: handleInstallPrerequisite is called
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: Installation happens in sorted order (18, 20)
        expect(result.success).toBe(true);
        expect(executedVersions).toEqual(['18', '20']);
    });

    it('should skip installation when all required versions have CLI installed', async () => {
        // Given: Adobe CLI is already installed for all required Node versions
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // All versions have CLI installed (none missing)
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
                { version: 'Node 24', major: '24', component: '10.0.0', installed: true },
            ],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        // When: handleInstallPrerequisite is called
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: No installation steps should execute
        expect(result.success).toBe(true);
        expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
        // Should send install-complete message
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-install-complete',
            expect.objectContaining({ index: 0, continueChecking: true })
        );
    });

    it('should handle checkPerNodeVersionStatus failure gracefully', async () => {
        // Given: checkPerNodeVersionStatus throws an error (fnm command failed)
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing...', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        const checkError = new Error('fnm command failed');
        (shared.checkPerNodeVersionStatus as jest.Mock).mockRejectedValueOnce(checkError);

        // When: handleInstallPrerequisite is called
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: Returns failure with error message
        expect(result.success).toBe(false);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                index: 0,
                status: 'error',
                message: expect.stringContaining('fnm command failed'),
            })
        );
    });
});
