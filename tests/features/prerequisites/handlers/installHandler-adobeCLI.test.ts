// Mock all dependencies (must be before imports)
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
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockAdobeCliPrereq,
    mockAdobeCliPrereqNoVersion,
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
} from './installHandler.testUtils';

describe('Prerequisites Install Handler - Adobe I/O CLI Unified Progress Messages (Step 1)', () => {
    let mockContext: jest.Mocked<HandlerContext>;

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

    it('should have correct version placeholders in prerequisites.json config', () => {
        // Given: Read actual prerequisites.json configuration
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(__dirname, '../../../../templates/prerequisites.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // When: Find Adobe I/O CLI prerequisite
        const aioPrereq = config.prerequisites.find((p: any) => p.id === 'aio-cli');

        // Then: Should have correct version placeholders in install steps
        expect(aioPrereq).toBeDefined();
        expect(aioPrereq.perNodeVersion).toBe(true);
        expect(aioPrereq.install.steps).toHaveLength(1);
        expect(aioPrereq.install.steps[0].name).toBe('Install Adobe I/O CLI (Node {version})');
        expect(aioPrereq.install.steps[0].message).toBe('Installing Adobe I/O CLI for Node {version}');
    });

    it('should use unified format with version placeholder for single Node version', async () => {
        // Given: Adobe I/O CLI prerequisite with perNodeVersion: true
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // Mock checkPerNodeVersionStatus to return Node 20 not installed
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 20', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });

        // When: Install handler generates steps for Node version "20"
        await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        // Then: progressUnifier.executeStep called with correct template and nodeVersion
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Install Adobe I/O CLI (Node {version})',
                message: 'Installing Adobe I/O CLI for Node {version}'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '20' }
        );
    });

    it('should use unified format for multi-version Adobe I/O CLI installation', async () => {
        // Given: Node versions 18 and 20 require Adobe I/O CLI installation
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // Mock checkPerNodeVersionStatus to return both Node 18 and 20 not installed
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 20', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['18', '20'],
        });

        // When: Install handler generates steps for both versions
        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: progressUnifier.executeStep called twice with correct templates
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(2);
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                name: 'Install Adobe I/O CLI (Node {version})',
                message: 'Installing Adobe I/O CLI for Node {version}'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '18' }
        );
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                name: 'Install Adobe I/O CLI (Node {version})',
                message: 'Installing Adobe I/O CLI for Node {version}'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '20' }
        );
    });

    it('should use default format without version placeholder when perNodeVersion is false', async () => {
        // Given: Adobe I/O CLI prerequisite without perNodeVersion
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereqNoVersion, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI', message: 'Installing Adobe I/O CLI globally', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // When: Install handler generates steps without version parameter
        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: progressUnifier.executeStep called with non-versioned template
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Install Adobe I/O CLI',
                message: 'Installing Adobe I/O CLI globally'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            undefined
        );
    });
});
