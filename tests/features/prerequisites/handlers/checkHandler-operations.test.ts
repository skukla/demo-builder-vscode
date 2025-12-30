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
 * Total tests: 11 (7 core + 4 per-node-version filtering)
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
        getPluginNodeVersions: jest.fn(),
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
        // Node uses component-driven check path
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'frontend' });
        // Node is installed but npm is not
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'frontend', installed: true },
        ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce({ installed: false, canInstall: true }); // npm not installed

        await handleCheckPrerequisites(context);

        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisites-complete',
            expect.objectContaining({
                allInstalled: false,
            })
        );
    });
});

/**
 * Per-Node-Version Prerequisite Filtering Tests
 *
 * Tests that per-node-version prerequisites (like Adobe I/O CLI) only show
 * and check Node versions that actually require them based on the requiredFor array.
 *
 * Total tests: 4
 */
describe('Prerequisites Check Handler - Per-Node-Version Filtering', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupStandardMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    it('should filter Node versions by requiredFor for per-node-version prerequisite', async () => {
        // Given: nodeVersionMapping with Node 18 (eds) and Node 20 (commerce-paas)
        // and a perNodeVersion prereq with requiredFor: ['commerce-paas']
        const perNodeVersionConfig = {
            version: '1.0',
            prerequisites: [
                {
                    id: 'adobe-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe CLI tool',
                    perNodeVersion: true,
                    requiredFor: ['commerce-paas'], // Only required for commerce-paas (Node 20)
                    check: { command: 'aio --version' },
                },
            ],
        };

        const context = createMockContext();
        context.sharedState.currentComponentSelection = {
            frontend: undefined,
            backend: 'commerce-paas',
            dependencies: [],
            integrations: [],
            appBuilder: [],
        };

        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(perNodeVersionConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            perNodeVersionConfig.prerequisites
        );

        // Node 18 for eds, Node 20 for commerce-paas
        const nodeVersionMapping = { '18': 'eds', '20': 'commerce-paas' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeVersionMapping);
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['18', '20']);
        // getPluginNodeVersions should return only Node 20 (commerce-paas)
        (shared.getPluginNodeVersions as jest.Mock).mockReturnValue(['20']);

        // CLI is installed
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
            installed: true,
            version: '10.0.0',
            canInstall: true,
        });

        // Cached per-version results (only Node 20 should be used)
        (context.prereqManager!.getCacheManager as jest.Mock).mockReturnValue({
            getPerVersionResults: jest.fn().mockReturnValue([
                { version: 'Node 18', major: '18', component: '', installed: false },
                { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
            ]),
            clearAll: jest.fn(),
        });

        // When: handleCheckPrerequisites is called
        await handleCheckPrerequisites(context);

        // Then: getPluginNodeVersions should be called with the correct parameters
        expect(shared.getPluginNodeVersions).toHaveBeenCalledWith(
            nodeVersionMapping,
            ['commerce-paas'],
            [], // dependencies
        );

        // Then: prerequisite-status should contain nodeVersionStatus with only Node 20 entry
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'Adobe I/O CLI',
                nodeVersionStatus: expect.arrayContaining([
                    expect.objectContaining({ major: '20' }),
                ]),
            })
        );

        // Verify Node 18 is NOT in the filtered result
        const statusCalls = (context.sendMessage as jest.Mock).mock.calls.filter(
            call => call[0] === 'prerequisite-status' && call[1].name === 'Adobe I/O CLI'
        );
        const lastStatusCall = statusCalls[statusCalls.length - 1];
        if (lastStatusCall && lastStatusCall[1].nodeVersionStatus) {
            const majors = lastStatusCall[1].nodeVersionStatus.map((v: any) => v.major);
            expect(majors).not.toContain('18');
            expect(majors).toContain('20');
        }
    });

    it('should return empty nodeVersionStatus when no components match requiredFor', async () => {
        // Given: nodeVersionMapping with only Node 18 (eds)
        // and a perNodeVersion prereq with requiredFor: ['api-mesh'] (no match)
        const perNodeVersionConfig = {
            version: '1.0',
            prerequisites: [
                {
                    id: 'adobe-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe CLI tool',
                    perNodeVersion: true,
                    requiredFor: ['api-mesh'], // Not in nodeVersionMapping
                    check: { command: 'aio --version' },
                },
            ],
        };

        const context = createMockContext();
        context.sharedState.currentComponentSelection = {
            frontend: undefined,
            backend: undefined,
            dependencies: [],
            integrations: [],
            appBuilder: [],
        };

        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(perNodeVersionConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            perNodeVersionConfig.prerequisites
        );

        const nodeVersionMapping = { '18': 'eds' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeVersionMapping);
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['18']);
        // getPluginNodeVersions returns empty array (no matching components)
        (shared.getPluginNodeVersions as jest.Mock).mockReturnValue([]);

        // CLI is installed
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
            installed: true,
            version: '10.0.0',
            canInstall: true,
        });

        (context.prereqManager!.getCacheManager as jest.Mock).mockReturnValue({
            getPerVersionResults: jest.fn().mockReturnValue([]),
            clearAll: jest.fn(),
        });

        // Mock checkPerNodeVersionStatus for fallback case (empty requiredMajors)
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        // When: handleCheckPrerequisites is called
        await handleCheckPrerequisites(context);

        // Then: getPluginNodeVersions should be called
        expect(shared.getPluginNodeVersions).toHaveBeenCalledWith(
            nodeVersionMapping,
            ['api-mesh'],
            [], // dependencies
        );

        // Then: prerequisite-status should contain empty nodeVersionStatus array
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'Adobe I/O CLI',
                nodeVersionStatus: [],
            })
        );
    });

    it('should include dependency components when filtering Node versions', async () => {
        // Given: nodeVersionMapping with Node 20 (commerce-paas)
        // and a perNodeVersion prereq with requiredFor: ['commerce-mesh']
        // and dependencies: ['commerce-mesh']
        const perNodeVersionConfig = {
            version: '1.0',
            prerequisites: [
                {
                    id: 'mesh-plugin',
                    name: 'API Mesh Plugin',
                    description: 'Mesh plugin',
                    perNodeVersion: true,
                    requiredFor: ['commerce-mesh'], // Required for mesh component
                    check: { command: 'aio plugins' },
                },
            ],
        };

        const context = createMockContext();
        context.sharedState.currentComponentSelection = {
            frontend: undefined,
            backend: 'commerce-paas',
            dependencies: ['commerce-mesh'], // Dependency on mesh
            integrations: [],
            appBuilder: [],
        };

        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(perNodeVersionConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            perNodeVersionConfig.prerequisites
        );

        const nodeVersionMapping = { '20': 'commerce-paas' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeVersionMapping);
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['20']);
        // getPluginNodeVersions should be called with dependencies and return Node 20
        (shared.getPluginNodeVersions as jest.Mock).mockReturnValue(['20']);

        // Plugin is installed
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
            installed: true,
            version: '1.0.0',
            canInstall: true,
        });

        (context.prereqManager!.getCacheManager as jest.Mock).mockReturnValue({
            getPerVersionResults: jest.fn().mockReturnValue([
                { version: 'Node 20', major: '20', component: '1.0.0', installed: true },
            ]),
            clearAll: jest.fn(),
        });

        // When: handleCheckPrerequisites is called
        await handleCheckPrerequisites(context);

        // Then: getPluginNodeVersions should be called with dependencies
        expect(shared.getPluginNodeVersions).toHaveBeenCalledWith(
            nodeVersionMapping,
            ['commerce-mesh'],
            ['commerce-mesh'], // dependencies passed
        );

        // Then: prerequisite-status should contain nodeVersionStatus with Node 20
        expect(context.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                name: 'API Mesh Plugin',
                nodeVersionStatus: expect.arrayContaining([
                    expect.objectContaining({ major: '20', installed: true }),
                ]),
            })
        );
    });

    it('should fall back to all Node versions when requiredFor is not specified', async () => {
        // Given: A perNodeVersion prereq WITHOUT requiredFor (backward compatibility)
        const perNodeVersionConfig = {
            version: '1.0',
            prerequisites: [
                {
                    id: 'adobe-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe CLI tool',
                    perNodeVersion: true,
                    // NO requiredFor - should use all Node versions
                    check: { command: 'aio --version' },
                },
            ],
        };

        const context = createMockContext();
        context.sharedState.currentComponentSelection = {
            frontend: undefined,
            backend: 'commerce-paas',
            dependencies: [],
            integrations: [],
            appBuilder: [],
        };

        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(perNodeVersionConfig);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
            perNodeVersionConfig.prerequisites
        );

        const nodeVersionMapping = { '18': 'eds', '20': 'commerce-paas' };
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeVersionMapping);
        (shared.hasNodeVersions as jest.Mock).mockReturnValue(true);
        // getNodeVersionKeys returns all versions
        (shared.getNodeVersionKeys as jest.Mock).mockReturnValue(['18', '20']);

        // CLI is installed
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
            installed: true,
            version: '10.0.0',
            canInstall: true,
        });

        (context.prereqManager!.getCacheManager as jest.Mock).mockReturnValue({
            getPerVersionResults: jest.fn().mockReturnValue([
                { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
            ]),
            clearAll: jest.fn(),
        });

        // When: handleCheckPrerequisites is called
        await handleCheckPrerequisites(context);

        // Then: getPluginNodeVersions should NOT be called (fallback to getNodeVersionKeys)
        expect(shared.getPluginNodeVersions).not.toHaveBeenCalled();

        // Then: getNodeVersionKeys should be called
        expect(shared.getNodeVersionKeys).toHaveBeenCalledWith(nodeVersionMapping);

        // Then: prerequisite-status should contain nodeVersionStatus with both Node 18 and 20
        const statusCalls = (context.sendMessage as jest.Mock).mock.calls.filter(
            call => call[0] === 'prerequisite-status' && call[1].name === 'Adobe I/O CLI'
        );
        const lastStatusCall = statusCalls[statusCalls.length - 1];
        if (lastStatusCall && lastStatusCall[1].nodeVersionStatus) {
            const majors = lastStatusCall[1].nodeVersionStatus.map((v: any) => v.major);
            expect(majors).toContain('18');
            expect(majors).toContain('20');
        }
    });
});
