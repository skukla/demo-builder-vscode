import {
    getNodeVersionMapping,
    getRequiredNodeVersions,
    areDependenciesInstalled,
    checkPerNodeVersionStatus,
} from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { HandlerContext } from '@/types/handlers';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Prerequisites Handlers Shared Utilities Test Suite
 *
 * Tests utility functions used across prerequisite handlers:
 * - getNodeVersionMapping: Component to Node version mapping
 * - getRequiredNodeVersions: Required Node versions array
 * - areDependenciesInstalled: Dependency validation
 * - checkPerNodeVersionStatus: Per-node-version prerequisite checks
 *
 * Total tests: 24
 */

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
        getNodeVersionManager: jest.fn(),
        reset: jest.fn(),
    },
}));

// Mock ComponentRegistryManager module
const mockGetNodeVersionToComponentMapping = jest.fn();
const mockGetRequiredNodeVersions = jest.fn();

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        getNodeVersionToComponentMapping: mockGetNodeVersionToComponentMapping,
        getRequiredNodeVersions: mockGetRequiredNodeVersions,
    })),
}));

// Helper to create mock HandlerContext
function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        prereqManager: {} as any,
        authManager: {} as any,
        componentHandler: {} as any,
        errorLogger: {} as any,
        progressUnifier: {} as any,
        stepLogger: {} as any,
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any,
        debugLogger: {} as any,
        context: {
            extensionPath: '/test/extension/path',
        } as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn(),
        sharedState: {
            isAuthenticating: false,
            currentComponentSelection: undefined,
            currentPrerequisiteStates: new Map(),
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}

describe('Prerequisites Handlers - Shared Utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getNodeVersionMapping', () => {
        it('should return mapping from ComponentRegistryManager', async () => {
            const mockMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
            mockGetNodeVersionToComponentMapping.mockResolvedValue(mockMapping);

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'commerce-paas',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });

            const result = await getNodeVersionMapping(context);

            expect(result).toEqual(mockMapping);
            expect(mockGetNodeVersionToComponentMapping).toHaveBeenCalledWith(
                'react-app',
                'commerce-paas',
                [],
                [],
                []
            );
        });

        it('should return empty object if no component selection', async () => {
            const context = createMockContext();

            const result = await getNodeVersionMapping(context);

            expect(result).toEqual({});
            expect(mockGetNodeVersionToComponentMapping).not.toHaveBeenCalled();
        });

        it('should handle ComponentRegistryManager failure gracefully', async () => {
            const error = new Error('Import failed');
            mockGetNodeVersionToComponentMapping.mockRejectedValue(error);

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'commerce-paas',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });

            const result = await getNodeVersionMapping(context);

            expect(result).toEqual({});
            expect(context.logger.warn).toHaveBeenCalledWith(
                'Failed to get Node version mapping:',
                error
            );
        });

        it('should pass all component selection parameters', async () => {
            mockGetNodeVersionToComponentMapping.mockResolvedValue({});

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-spa',
                        backend: 'nodejs-api',
                        dependencies: ['dep1', 'dep2'],
                        externalSystems: ['commerce-mesh'],
                        appBuilder: ['app-builder-action'],
                    },
                },
            });

            await getNodeVersionMapping(context);

            expect(mockGetNodeVersionToComponentMapping).toHaveBeenCalledWith(
                'react-spa',
                'nodejs-api',
                ['dep1', 'dep2'],
                ['commerce-mesh'],
                ['app-builder-action']
            );
        });

        it('should create ComponentRegistryManager with extension path', async () => {
            mockGetNodeVersionToComponentMapping.mockResolvedValue({});

            const context = createMockContext({
                context: { extensionPath: '/custom/path' } as any,
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'nodejs',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });

            await getNodeVersionMapping(context);

            const { ComponentRegistryManager } = await import(
                '@/features/components/services/ComponentRegistryManager'
            );
            expect(ComponentRegistryManager).toHaveBeenCalledWith('/custom/path');
        });
    });

    describe('getRequiredNodeVersions', () => {
        it('should return sorted array of Node versions', async () => {
            const mockVersions = new Set(['20', '18', '24']);
            mockGetRequiredNodeVersions.mockResolvedValue(mockVersions);

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'commerce-paas',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });

            const result = await getRequiredNodeVersions(context);

            expect(result).toEqual(['18', '20', '24']);
        });

        it('should return empty array if no component selection', async () => {
            const context = createMockContext();

            const result = await getRequiredNodeVersions(context);

            expect(result).toEqual([]);
            expect(mockGetRequiredNodeVersions).not.toHaveBeenCalled();
        });

        it('should sort versions in ascending order', async () => {
            const mockVersions = new Set(['24', '18', '20']);
            mockGetRequiredNodeVersions.mockResolvedValue(mockVersions);

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'nodejs',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });

            const result = await getRequiredNodeVersions(context);

            expect(result).toEqual(['18', '20', '24']);
        });

        it('should handle ComponentRegistryManager failure', async () => {
            mockGetRequiredNodeVersions.mockRejectedValue(new Error('Failed'));

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'nodejs',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });

            const result = await getRequiredNodeVersions(context);

            expect(result).toEqual([]);
        });

        it('should pass all component selection parameters', async () => {
            mockGetRequiredNodeVersions.mockResolvedValue(new Set());

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-spa',
                        backend: 'nodejs-api',
                        dependencies: ['dep1'],
                        externalSystems: ['mesh'],
                        appBuilder: ['action'],
                    },
                },
            });

            await getRequiredNodeVersions(context);

            expect(mockGetRequiredNodeVersions).toHaveBeenCalledWith(
                'react-spa',
                'nodejs-api',
                ['dep1'],
                ['mesh'],
                ['action']
            );
        });
    });

    describe('areDependenciesInstalled', () => {
        it('should return true when no dependencies', () => {
            const prereq: PrerequisiteDefinition = {
                id: 'test',
                name: 'Test',
                check: { command: 'test --version' },
            } as any;

            const context = createMockContext();

            const result = areDependenciesInstalled(prereq, context);

            expect(result).toBe(true);
        });

        it('should return true when all dependencies installed', () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                depends: ['node', 'npm'],
                check: { command: 'aio --version' },
            } as any;

            const states = new Map();
            states.set(0, {
                prereq: { id: 'node', name: 'Node.js' },
                result: { installed: true } as PrerequisiteStatus,
            });
            states.set(1, {
                prereq: { id: 'npm', name: 'npm' },
                result: { installed: true } as PrerequisiteStatus,
            });

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentPrerequisiteStates: states,
                },
            });

            const result = areDependenciesInstalled(prereq, context);

            expect(result).toBe(true);
        });

        it('should return false when any dependency not installed', () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                depends: ['node', 'npm'],
                check: { command: 'aio --version' },
            } as any;

            const states = new Map();
            states.set(0, {
                prereq: { id: 'node', name: 'Node.js' },
                result: { installed: true } as PrerequisiteStatus,
            });
            states.set(1, {
                prereq: { id: 'npm', name: 'npm' },
                result: { installed: false } as PrerequisiteStatus,
            });

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentPrerequisiteStates: states,
                },
            });

            const result = areDependenciesInstalled(prereq, context);

            expect(result).toBe(false);
        });

        it('should handle Node dependency with missing versions', () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                depends: ['node'],
                check: { command: 'aio --version' },
            } as any;

            const states = new Map();
            states.set(0, {
                prereq: { id: 'node', name: 'Node.js' },
                result: { installed: true } as PrerequisiteStatus,
                nodeVersionStatus: [
                    { version: '18', component: 'v18.0.0', installed: true },
                    { version: '20', component: 'v20.0.0', installed: false },
                ],
            });

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentPrerequisiteStates: states,
                },
            });

            const result = areDependenciesInstalled(prereq, context);

            expect(result).toBe(false);
        });

        it('should return false when dependency not found in states', () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                depends: ['node'],
                check: { command: 'aio --version' },
            } as any;

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentPrerequisiteStates: new Map(),
                },
            });

            const result = areDependenciesInstalled(prereq, context);

            expect(result).toBe(false);
        });

        it('should check all dependencies', () => {
            const prereq: PrerequisiteDefinition = {
                id: 'test-tool',
                name: 'Test Tool',
                depends: ['dep1', 'dep2', 'dep3'],
                check: { command: 'test --version' },
            } as any;

            const states = new Map();
            states.set(0, {
                prereq: { id: 'dep1', name: 'Dep1' },
                result: { installed: true } as PrerequisiteStatus,
            });
            states.set(1, {
                prereq: { id: 'dep2', name: 'Dep2' },
                result: { installed: true } as PrerequisiteStatus,
            });
            states.set(2, {
                prereq: { id: 'dep3', name: 'Dep3' },
                result: { installed: true } as PrerequisiteStatus,
            });

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentPrerequisiteStates: states,
                },
            });

            const result = areDependenciesInstalled(prereq, context);

            expect(result).toBe(true);
        });
    });

    describe('checkPerNodeVersionStatus', () => {
        let mockCommandExecutor: any;

        beforeEach(() => {
            mockCommandExecutor = {
                execute: jest.fn(),
            };
            (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);
        });

        it('should check all Node versions for per-node prerequisite', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\S+)',
                },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0\nv20.0.0', stderr: '', exitCode: 0 });
                }
                return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', exitCode: 0 });
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            expect(result.perNodeVersionStatus).toEqual([
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ]);
            expect(result.perNodeVariantMissing).toBe(false);
            expect(result.missingVariantMajors).toEqual([]);
        });

        it('should detect installed versions correctly', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0', stderr: '', exitCode: 0 });
                }
                return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', exitCode: 0 });
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

            expect(result.perNodeVersionStatus[0].installed).toBe(true);
        });

        it('should detect missing versions correctly', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0', stderr: '', exitCode: 0 });
                }
                return Promise.reject(new Error('Command failed'));
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

            expect(result.perNodeVersionStatus[0].installed).toBe(false);
            expect(result.perNodeVariantMissing).toBe(true);
            expect(result.missingVariantMajors).toEqual(['18']);
        });

        it('should skip Node versions not installed', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0', stderr: '', exitCode: 0 }); // Only 18 installed
                }
                return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', exitCode: 0 });
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            expect(result.perNodeVersionStatus).toHaveLength(2);
            expect(result.perNodeVersionStatus[1]).toEqual({
                version: 'Node 20',
                component: '',
                installed: false,
            });
            expect(result.missingVariantMajors).toContain('20');
        });

        it('should parse version from command output', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\S+)',
                },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0', stderr: '', exitCode: 0 });
                }
                return Promise.resolve({ stdout: '@adobe/aio-cli/11.2.3\nNode: v18.0.0', stderr: '', exitCode: 0 });
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

            expect(result.perNodeVersionStatus[0].component).toBe('11.2.3');
        });

        it('should use commandManager.execute() with useNodeVersion', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0', stderr: '', exitCode: 0 });
                }
                return Promise.resolve({ stdout: 'version 10.0.0', stderr: '', exitCode: 0 });
            });

            const context = createMockContext();
            await checkPerNodeVersionStatus(prereq, ['18'], context);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio --version',
                expect.objectContaining({
                    useNodeVersion: '18',
                })
            );
        });

        it('should return correct perNodeVariantMissing flag', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            let callCount = 0;
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0\nv20.0.0', stderr: '', exitCode: 0 });
                }
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({ stdout: 'version 10.0.0', stderr: '', exitCode: 0 }); // 18 installed
                }
                return Promise.reject(new Error('Not found')); // 20 not installed
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            expect(result.perNodeVariantMissing).toBe(true);
            expect(result.missingVariantMajors).toEqual(['20']);
        });

        it('should return correct missingVariantMajors list', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: 'v18.0.0', stderr: '', exitCode: 0 });
                }
                return Promise.reject(new Error('Not found'));
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20', '24'], context);

            // 20 and 24 not installed as Node versions, 18 check failed
            expect(result.missingVariantMajors).toEqual(['18', '20', '24']);
        });

        it('should return empty arrays when not perNodeVersion', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'git',
                name: 'Git',
                perNodeVersion: false,
                check: { command: 'git --version' },
            } as any;

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            expect(result.perNodeVersionStatus).toEqual([]);
            expect(result.perNodeVariantMissing).toBe(false);
            expect(result.missingVariantMajors).toEqual([]);
        });

        it('should return empty arrays when no Node versions provided', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, [], context);

            expect(result.perNodeVersionStatus).toEqual([]);
            expect(result.perNodeVariantMissing).toBe(false);
            expect(result.missingVariantMajors).toEqual([]);
        });

        it('should log debug message when Node version not installed', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as any;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
                }
                return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', exitCode: 0 });
            });

            const context = createMockContext();
            await checkPerNodeVersionStatus(prereq, ['20'], context);

            expect(context.logger.debug).toHaveBeenCalledWith(
                expect.stringMatching(/Node 20 not installed, skipping Adobe I\/O CLI check/)
            );
        });
    });
});
