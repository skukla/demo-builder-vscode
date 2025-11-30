// Mock all dependencies (must be before imports)
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getRequiredNodeVersions: jest.fn(),
        getNodeVersionMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
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
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockAdobeCliPrereq,
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
} from './installHandler.testUtils';

describe('Prerequisites Install Handler - Shell Options for fnm list', () => {
    let mockContext: jest.Mocked<HandlerContext>;

    // NOTE: These tests now verify integration with checkPerNodeVersionStatus shared utility
    // The actual fnm list shell option behavior is tested in shared-per-node-status.test.ts

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();

        // Mock shared utilities
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20']);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
            '18': 'React App',
            '20': 'Node Backend',
        });
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

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
});
