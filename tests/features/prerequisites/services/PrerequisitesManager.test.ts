/**
 * Tests for PrerequisitesManager
 * Core service for managing prerequisite definitions and checks
 */

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { Logger } from '@/core/logging';
import { ServiceLocator } from '@/core/di';
import type { CommandExecutor } from '@/core/shell';
import type { NodeVersionManager } from '@/core/shell/NodeVersionManager';

// Mock the ConfigurationLoader
jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di');
jest.mock('@/core/shell/NodeVersionManager');

describe('PrerequisitesManager', () => {
    let manager: PrerequisitesManager;
    let mockLogger: jest.Mocked<Logger>;
    let mockExecutor: jest.Mocked<CommandExecutor>;
    let mockNodeVersionManager: jest.Mocked<NodeVersionManager>;

    const mockConfig = {
        prerequisites: [
            {
                id: 'node',
                name: 'Node.js',
                description: 'JavaScript runtime',
                check: {
                    command: 'node',
                    args: ['--version'],
                },
                optional: false,
            },
            {
                id: 'npm',
                name: 'npm',
                description: 'Package manager',
                check: {
                    command: 'npm',
                    args: ['--version'],
                },
                optional: false,
                dependencies: ['node'],
            },
            {
                id: 'git',
                name: 'Git',
                description: 'Version control',
                check: {
                    command: 'git',
                    args: ['--version'],
                },
                optional: true,
            },
        ],
        componentRequirements: {
            'react-app': {
                prerequisites: ['node', 'npm'],
            },
            'commerce-paas': {
                prerequisites: ['node', 'npm', 'git'],
            },
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        mockExecutor = {
            execute: jest.fn(),
        } as any;

        mockNodeVersionManager = {
            list: jest.fn(),
            current: jest.fn(),
            use: jest.fn(),
            execWithVersion: jest.fn(),
        } as any;

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockExecutor);
        (ServiceLocator.getNodeVersionManager as jest.Mock).mockReturnValue(mockNodeVersionManager);

        // Mock ConfigurationLoader
        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        ConfigurationLoader.mockImplementation(() => ({
            load: jest.fn().mockResolvedValue(mockConfig),
        }));

        manager = new PrerequisitesManager('/mock/extension/path', mockLogger);
    });

    describe('loadConfig', () => {
        it('should load prerequisites configuration', async () => {
            const config = await manager.loadConfig();

            expect(config).toEqual(mockConfig);
            expect(config.prerequisites).toHaveLength(3);
        });

        it('should handle configuration load errors', async () => {
            const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
            ConfigurationLoader.mockImplementation(() => ({
                load: jest.fn().mockRejectedValue(new Error('Config not found')),
            }));

            manager = new PrerequisitesManager('/mock/extension/path', mockLogger);

            await expect(manager.loadConfig()).rejects.toThrow('Config not found');
        });
    });

    describe('getPrerequisiteById', () => {
        it('should return prerequisite by id', async () => {
            const prereq = await manager.getPrerequisiteById('node');

            expect(prereq).toBeDefined();
            expect(prereq?.id).toBe('node');
            expect(prereq?.name).toBe('Node.js');
        });

        it('should return undefined for non-existent id', async () => {
            const prereq = await manager.getPrerequisiteById('non-existent');

            expect(prereq).toBeUndefined();
        });
    });

    describe('getRequiredPrerequisites', () => {
        it('should return all prerequisites when no components selected', async () => {
            const required = await manager.getRequiredPrerequisites();

            // Only returns non-optional prerequisites (node, npm) - git is optional
            expect(required).toHaveLength(2);
            expect(required.some(p => p.id === 'node')).toBe(true);
            expect(required.some(p => p.id === 'npm')).toBe(true);
        });

        it('should return component-specific prerequisites for frontend', async () => {
            const required = await manager.getRequiredPrerequisites({
                frontend: 'react-app',
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
        });

        it('should return combined prerequisites for multiple components', async () => {
            const required = await manager.getRequiredPrerequisites({
                frontend: 'react-app',
                backend: 'commerce-paas',
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
            expect(ids).toContain('git');
        });

        it('should handle dependencies array', async () => {
            const required = await manager.getRequiredPrerequisites({
                dependencies: ['commerce-paas'],
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
            expect(ids).toContain('git');
        });

        it('should handle appBuilderApps array', async () => {
            const required = await manager.getRequiredPrerequisites({
                appBuilderApps: ['react-app'],
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
        });
    });

    describe('resolveDependencies', () => {
        it('should return prerequisites in dependency order', () => {
            const result = manager.resolveDependencies(mockConfig.prerequisites);

            // node should come before npm (npm depends on node)
            const nodeIndex = result.findIndex(p => p.id === 'node');
            const npmIndex = result.findIndex(p => p.id === 'npm');

            expect(nodeIndex).toBeLessThan(npmIndex);
        });

        it('should handle empty array', () => {
            const result = manager.resolveDependencies([]);

            expect(result).toEqual([]);
        });

        it('should handle prerequisites without dependencies', () => {
            const prereqs = [
                {
                    id: 'tool1',
                    name: 'Tool 1',
                    description: 'First tool',
                    check: { command: 'tool1', args: [] },
                },
                {
                    id: 'tool2',
                    name: 'Tool 2',
                    description: 'Second tool',
                    check: { command: 'tool2', args: [] },
                },
            ];

            const result = manager.resolveDependencies(prereqs);

            expect(result).toHaveLength(2);
        });
    });

    describe('checkPrerequisite', () => {
        it('should check prerequisite and return installed status', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: 'v18.0.0',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // Add parseVersion to extract version from stdout
            const prereq = {
                ...mockConfig.prerequisites[0],
                check: {
                    command: 'node',
                    args: ['--version'],
                    parseVersion: 'v(\\d+\\.\\d+\\.\\d+)',
                },
            };
            const result = await manager.checkPrerequisite(prereq);

            expect(result.installed).toBe(true);
            expect(result.version).toBe('18.0.0');
            expect(mockExecutor.execute).toHaveBeenCalled();
        });

        it('should return not installed when command fails', async () => {
            // When command is not found, execute() throws ENOENT error
            const error: NodeJS.ErrnoException = new Error('Command not found');
            error.code = 'ENOENT';
            mockExecutor.execute.mockRejectedValue(error);

            const prereq = mockConfig.prerequisites[0]; // node
            const result = await manager.checkPrerequisite(prereq);

            expect(result.installed).toBe(false);
        });

        it('should handle timeout errors', async () => {
            mockExecutor.execute.mockRejectedValue(
                Object.assign(new Error('Timeout'), { name: 'TimeoutError' })
            );

            const prereq = mockConfig.prerequisites[0]; // node

            // Error message includes prereq name and timeout duration
            // Step 1: Reduced timeout from 60s to 10s for faster failure feedback
            await expect(manager.checkPrerequisite(prereq)).rejects.toThrow('Node.js check timed out after 10 seconds');
        });

        it('should extract version from stdout', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: 'Node.js v20.10.0\n',
                stderr: '',
                code: 0,
                duration: 75,
            });

            // Add parseVersion to extract version from stdout
            const prereq = {
                ...mockConfig.prerequisites[0],
                check: {
                    command: 'node',
                    args: ['--version'],
                    parseVersion: 'v(\\d+\\.\\d+\\.\\d+)',
                },
            };
            const result = await manager.checkPrerequisite(prereq);

            expect(result.installed).toBe(true);
            expect(result.version).toBe('20.10.0');
        });
    });

    describe('checkMultipleNodeVersions', () => {
        it('should check multiple Node versions', async () => {
            // Mock NodeVersionManager.list() to return installed versions
            mockNodeVersionManager.list.mockResolvedValue([
                'v18.20.8',
                'v20.19.5',
            ]);

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            const result = await manager.checkMultipleNodeVersions(mapping);

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                version: 'Node 18.20.8',
                component: 'react-app',
                installed: true,
            });
            expect(result[1]).toMatchObject({
                version: 'Node 20.19.5',
                component: 'commerce-paas',
                installed: true,
            });
        });

        it('should detect missing Node versions', async () => {
            // Mock NodeVersionManager.list() to return only Node 18
            mockNodeVersionManager.list.mockResolvedValue([
                'v18.20.8',
            ]);

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            const result = await manager.checkMultipleNodeVersions(mapping);

            expect(result).toHaveLength(2);
            expect(result[0].installed).toBe(true);
            expect(result[0].version).toBe('Node 18.20.8');
            expect(result[1].installed).toBe(false);
            expect(result[1].version).toBe('Node 20'); // No full version available
        });

        it('should handle empty mapping', async () => {
            const result = await manager.checkMultipleNodeVersions({});

            expect(result).toEqual([]);
        });
    });
});
