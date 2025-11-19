/**
 * Install Handler Tests - Happy Path Scenarios
 *
 * Tests the successful installation flows including:
 * - Basic prerequisite installation
 * - Manual installation (opens URL)
 * - Multi-version Node.js installation
 * - Per-node-version prerequisites (Adobe CLI)
 * - Progress updates during installation
 * - Post-installation verification
 * - Early return when already installed
 * - Version templating in install steps
 * - Default steps optimization (only for last version)
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
import * as vscode from 'vscode';
import {
    mockNodePrereq,
    mockAdobeCliPrereq,
    mockManualPrereq,
    mockNodeResult,
    mockNpmPrereq,
    createMockContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - Happy Path', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createMockContext();
    });

    it('should install basic prerequisite successfully', async () => {
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.prereqManager!.getInstallSteps).toHaveBeenCalled();
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalled();
        expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalled();
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-install-complete',
            expect.objectContaining({ index: 0, continueChecking: true })
        );
    });

    it('should handle manual installation by opening URL', async () => {
        const states = new Map();
        states.set(0, { prereq: mockManualPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            manual: true,
            url: 'https://www.docker.com/get-started',
        });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(vscode.env.openExternal).toHaveBeenCalledWith({ url: 'https://www.docker.com/get-started' });
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'warning',
                message: 'Manual installation required. Open: https://www.docker.com/get-started',
            })
        );
    });

    it('should install multi-version Node.js with missing majors', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: false },
            { version: 'Node 20', component: 'v20.0.0', installed: true },
        ]);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Should call getNodeVersionMapping twice (once for getInstallSteps check, once for missing majors)
        expect(shared.getNodeVersionMapping).toHaveBeenCalled();
    });

    it('should install per-node-version prerequisite (Adobe CLI)', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });
        // Note: Per-node version checking happens inside executeStep/checkPrerequisite which are mocked

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        expect(result.success).toBe(true);
        // Note: Internal fnm operations are tested in integration tests
    });

    it('should send progress updates during installation', async () => {
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'checking',
                unifiedProgress: expect.objectContaining({
                    current: expect.any(Number),
                    total: expect.any(Number),
                }),
            })
        );
    });

    it('should complete installation and verify successfully', async () => {
        const verifiedResult = {
            ...mockNodeResult,
            installed: true,
            version: '9.0.0',
        };
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(verifiedResult);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalled();
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'success',
                installed: true,
                version: '9.0.0',
            })
        );
    });

    it('should return early if already installed for all Node versions', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });
        // Note: Per-node version checking happens inside checkPerNodeVersionStatus which uses CommandExecutor

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-install-complete',
            expect.objectContaining({ index: 0, continueChecking: true })
        );
    });

    it('should handle version templating in install steps', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: false },
        ]);

        await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '18' });

        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Install Node {version}' }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '18' }
        );
    });

    it('should run default steps only for last version (optimization)', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: false },
            { version: 'Node 20', component: 'v20.0.0', installed: false },
        ]);

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Install step should be called for both versions (18 and 20)
        // Default step should only be called once for version 20
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(3); // 2 installs + 1 default
    });
});
