import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockConfig,
    mockNodeResult,
    mockNpmResult,
    mockAdobeCliPrereq,
    createMockContext,
    createComponentSelection,
    setupStandardMocks,
    cleanupTests,
} from './checkHandler.testUtils';

/**
 * Prerequisites Check Handler - Multi-Version Node.js Support
 *
 * Tests multi-version Node.js detection and per-node-version prerequisites:
 * - Detecting Node multi-version requirements from component selection
 * - Checking per-node-version prerequisites (Adobe CLI)
 * - Handling missing specific Node.js versions
 * - Handling partial per-node-version installations
 *
 * Total tests: 4
 */

// Mock shared utilities
jest.mock('@/features/prerequisites/handlers/shared', () => ({
    getNodeVersionMapping: jest.fn(),
    checkPerNodeVersionStatus: jest.fn(),
    areDependenciesInstalled: jest.fn(),
}));

// Mock timeout utilities
jest.mock('@/types/typeGuards', () => ({
    toError: (error: any) => (error instanceof Error ? error : new Error(String(error))),
    isTimeoutError: (error: any) => error?.message?.includes('timeout'),
}));

describe('Prerequisites Check Handler - Multi-Version Node.js Support', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Ensure real timers are active (in case another test left fake timers)
        jest.useRealTimers();
        setupStandardMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    it('should detect Node multi-version requirements from component selection', async () => {
        const nodeMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection('commerce-paas'),
            },
        });
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce(mockNpmResult);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: '18', component: 'v18.0.0', installed: true },
            { version: '20', component: 'v20.0.0', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        expect(context.prereqManager!.checkMultipleNodeVersions).toHaveBeenCalledWith(
            nodeMapping
        );
    });

    it('should check per-node-version prerequisites (Adobe CLI)', async () => {
        const nodeMapping = { '18': 'commerce-paas' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 18', component: '10.0.0', installed: true }],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        const configWithCli = {
            version: '1.0',
            prerequisites: [mockConfig.prerequisites[0], mockAdobeCliPrereq],
        };

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection('commerce-paas'),
            },
        });
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(configWithCli);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            configWithCli.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce({ installed: true, canInstall: false });

        await handleCheckPrerequisites(context);

        expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledWith(
            mockAdobeCliPrereq,
            ['18'],
            context
        );
    });

    it('should handle Node prerequisite with missing specific versions', async () => {
        const nodeMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);

        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce(mockNpmResult);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: '18', component: 'v18.0.0', installed: true },
            { version: '20', component: '', installed: false },
        ]);

        await handleCheckPrerequisites(context);

        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'Node.js',
                status: 'error',
            })
        );
    });

    it('should handle per-node-version prerequisite with partial installs', async () => {
        const nodeMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });

        const configWithCli = {
            version: '1.0',
            prerequisites: [mockConfig.prerequisites[0], mockAdobeCliPrereq],
        };

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection('commerce-paas', ['action']),
            },
        });
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(configWithCli);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            configWithCli.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce({ installed: true, canInstall: false });

        await handleCheckPrerequisites(context);

        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'Adobe I/O CLI',
                status: 'error',
                installed: false,
            })
        );
    });
});
