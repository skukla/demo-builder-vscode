import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockConfig,
    mockNodeResult,
    mockNpmResult,
    createMockContext,
    setupStandardMocks,
    cleanupTests,
} from './checkHandler.testUtils';

/**
 * Prerequisites Check Handler - Core Operations
 *
 * Tests the core prerequisite checking operations:
 * - Loading configuration
 * - Checking prerequisites in dependency order
 * - Sending progress updates
 * - Handling successful completion
 * - Optional prerequisite handling
 *
 * Total tests: 7
 */

// Mock shared utilities - preserve real implementations, mock async functions
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getNodeVersionMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        areDependenciesInstalled: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
    };
});

// Mock timeout utilities
jest.mock('@/types/typeGuards', () => ({
    toError: (error: any) => (error instanceof Error ? error : new Error(String(error))),
    isTimeoutError: (error: any) => error?.message?.includes('timeout'),
}));

describe('Prerequisites Check Handler - Core Operations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupStandardMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    it('should load prerequisites config and send to UI', async () => {
        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce(mockNpmResult);

        await handleCheckPrerequisites(context);

        expect(context.prereqManager!.loadConfig).toHaveBeenCalledTimes(1);
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisites-loaded',
            expect.objectContaining({
                prerequisites: expect.arrayContaining([
                    expect.objectContaining({ name: 'Node.js' }),
                    expect.objectContaining({ name: 'npm' }),
                ]),
            })
        );
    });

    it('should check all prerequisites in dependency order', async () => {
        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        // Node uses checkMultipleNodeVersions (component-driven), npm uses checkPrerequisite
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'frontend' });
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'frontend', installed: true },
        ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValueOnce(mockNpmResult);

        await handleCheckPrerequisites(context);

        // Node uses checkMultipleNodeVersions, npm uses checkPrerequisite
        expect(context.prereqManager!.checkMultipleNodeVersions).toHaveBeenCalledTimes(1);
        expect(context.prereqManager!.checkPrerequisite).toHaveBeenCalledTimes(1);
        expect(context.prereqManager!.checkPrerequisite).toHaveBeenCalledWith(
            mockConfig.prerequisites[1] // npm
        );
    });

    it('should handle all prerequisites installed successfully', async () => {
        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        // Node uses checkMultipleNodeVersions (component-driven), npm uses checkPrerequisite
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'frontend' });
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'frontend', installed: true },
        ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValueOnce(mockNpmResult);

        const result = await handleCheckPrerequisites(context);

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisites-complete',
            expect.objectContaining({
                allInstalled: true,
            })
        );
    });

    it('should handle optional prerequisites marked correctly', async () => {
        const optionalConfig = {
            version: '1.0',
            prerequisites: [
                { ...mockConfig.prerequisites[0], optional: false },
                { ...mockConfig.prerequisites[1], optional: true },
            ],
        };
        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(optionalConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            optionalConfig.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce({ ...mockNpmResult, installed: false });

        await handleCheckPrerequisites(context);

        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'npm',
                required: false,
            })
        );
    });

    it('should send progress updates during checking', async () => {
        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce(mockNpmResult);

        await handleCheckPrerequisites(context);

        // Should send checking status for each prerequisite
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'checking',
                name: 'Node.js',
            })
        );
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'checking',
                name: 'npm',
            })
        );
    });

    it('should complete with allInstalled=true when all required installed', async () => {
        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        // Node uses checkMultipleNodeVersions (component-driven), npm uses checkPrerequisite
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'frontend' });
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'frontend', installed: true },
        ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValueOnce(mockNpmResult);

        await handleCheckPrerequisites(context);

        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisites-complete',
            expect.objectContaining({
                allInstalled: true,
            })
        );
    });

    it('should handle mix of installed and not-installed prerequisites', async () => {
        const context = createMockContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            mockConfig.prerequisites
        );
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(mockNodeResult)
            .mockResolvedValueOnce({ installed: false, canInstall: true });

        await handleCheckPrerequisites(context);

        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisites-complete',
            expect.objectContaining({
                allInstalled: false,
            })
        );
    });
});
