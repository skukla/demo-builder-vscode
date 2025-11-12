/**
 * Tests for PrerequisitesManager
 * Core service for managing prerequisite definitions and checks
 */

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { Logger } from '@/core/logging';
import { ServiceLocator } from '@/core/di';
import type { CommandExecutor } from '@/core/shell';

// Mock the ConfigurationLoader
jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di');

// Mock fs module for components.json reading
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({
        infrastructure: {
            'adobe-cli': {
                name: 'Adobe I/O CLI & SDK',
                description: 'Command-line interface and SDK for Adobe I/O services'
            }
        }
    }))
}));

// Mock debugLogger to prevent "Logger not initialized" errors
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('PrerequisitesManager', () => {
    let manager: PrerequisitesManager;
    let mockLogger: jest.Mocked<Logger>;
    let mockExecutor: jest.Mocked<CommandExecutor>;

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

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockExecutor);

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

    describe('infrastructure version removal', () => {
        it('should return empty steps array when no nodeVersions provided', async () => {
            // Given: Node prerequisite with dynamic installation
            const nodePrereq = {
                id: 'node',
                name: 'Node.js',
                description: 'JavaScript runtime',
                check: {
                    command: 'node',
                    args: ['--version'],
                },
                install: {
                    dynamic: true,
                    steps: [
                        {
                            name: 'Install Node.js {version}',
                            message: 'Installing Node.js {version}',
                            commandTemplate: 'fnm install {version}',
                            progressStrategy: 'exact' as const,
                            estimatedDuration: 30000,
                        },
                    ],
                },
            };

            // When: getInstallSteps called without nodeVersions option
            const result = manager.getInstallSteps(nodePrereq, {});

            // Then: Returns empty steps array (no fallback version)
            expect(result).not.toBeNull();
            expect(result?.steps).toHaveLength(0);
        });

        it('should not have infrastructureNodeVersion field', () => {
            // Given: PrerequisitesManager instantiated
            // When: Checking instance properties
            // Then: No infrastructureNodeVersion field exists
            expect(manager).not.toHaveProperty('infrastructureNodeVersion');
        });

        it('should not reference infrastructure nodeVersion in components.json mock', () => {
            // Given: components.json loaded
            const fs = require('fs');
            const componentsJson = JSON.parse(fs.readFileSync());

            // When: Checking infrastructure section
            // Then: No nodeVersion field present
            expect(componentsJson.infrastructure?.['adobe-cli']).toBeDefined();
            expect(componentsJson.infrastructure['adobe-cli'].nodeVersion).toBeUndefined();
        });
    });

    describe('checkMultipleNodeVersions', () => {
        it('should execute fnm list with shell option in PrerequisitesManager', async () => {
            // Mock fnm list command to return installed versions
            mockExecutor.execute.mockResolvedValue({
                stdout: 'v18.20.8\nv20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            await manager.checkMultipleNodeVersions(mapping);

            // Verify fnm list was called with shell option
            expect(mockExecutor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({
                shell: expect.any(String), // Expects shell path (e.g., '/bin/bash')
                timeout: expect.any(Number),
            }));
        });

        it('should check multiple Node versions', async () => {
            // Mock fnm list command to return installed versions
            mockExecutor.execute.mockResolvedValue({
                stdout: 'v18.20.8\nv20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

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
            expect(mockExecutor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({ shell: expect.any(String) }));
        });

        it('should detect missing Node versions', async () => {
            // Mock fnm list command to return only Node 18
            mockExecutor.execute.mockResolvedValue({
                stdout: 'v18.20.8\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

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
            expect(mockExecutor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({ shell: expect.any(String) }));
        });

        it('should handle empty mapping', async () => {
            const result = await manager.checkMultipleNodeVersions({});

            expect(result).toEqual([]);
        });

        it('should handle ENOENT errors in PrerequisitesManager gracefully', async () => {
            const enoentError: NodeJS.ErrnoException = new Error('spawn fnm ENOENT');
            enoentError.code = 'ENOENT';
            mockExecutor.execute.mockRejectedValue(enoentError);

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            const result = await manager.checkMultipleNodeVersions(mapping);

            // Should return all as not installed
            expect(result).toHaveLength(2);
            expect(result[0].installed).toBe(false);
            expect(result[1].installed).toBe(false);
            // Verify fnm list was attempted with shell option
            expect(mockExecutor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({ shell: expect.any(String) }));
        });
    });

    describe('checkVersionSatisfaction', () => {
        it('should return true when version family is satisfied', async () => {
            // Given: Node 24.0.10 installed, requirement is 24.x
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v24.0.10\nv18.19.0\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns true (no installation needed)
            expect(satisfied).toBe(true);
        });

        it('should return false when no version satisfies', async () => {
            // Given: Only Node 18.x installed, requirement is 24.x
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v18.19.0\nv20.10.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns false (installation needed)
            expect(satisfied).toBe(false);
        });

        it('should handle multiple versions in same family', async () => {
            // Given: Multiple Node 18.x versions installed
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v18.19.0\nv18.20.8\nv20.10.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('18') called
            const satisfied = await manager.checkVersionSatisfaction('18');

            // Then: Returns true (any 18.x satisfies)
            expect(satisfied).toBe(true);
        });

        it('should return false when fnm list is empty', async () => {
            // Given: No Node versions installed
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns false
            expect(satisfied).toBe(false);
        });

        it('should handle fnm list failure gracefully', async () => {
            // Given: fnm list command fails
            const enoentError: NodeJS.ErrnoException = new Error('spawn fnm ENOENT');
            enoentError.code = 'ENOENT';
            mockExecutor.execute.mockRejectedValueOnce(enoentError);

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns false (safe default)
            expect(satisfied).toBe(false);
        });

        it('should reject invalid version family input (security)', async () => {
            // SECURITY TEST: Prevent injection attacks via malicious version family
            // Given: Malicious inputs that could cause injection
            const maliciousInputs = [
                '24; rm -rf /',          // Command injection attempt
                '24 && malicious',       // Command chaining
                '../../../etc/passwd',   // Path traversal
                '24`whoami`',            // Command substitution
                '24$(whoami)',           // Command substitution (alternate)
                '24|cat /etc/passwd',    // Pipe injection
                '24\nrm -rf /',          // Newline injection
            ];

            // When: Each malicious input is tested
            for (const maliciousInput of maliciousInputs) {
                const satisfied = await manager.checkVersionSatisfaction(maliciousInput);

                // Then: Input is rejected (returns false)
                expect(satisfied).toBe(false);

                // And: Warning is logged
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid version family rejected')
                );
            }

            // And: No command was executed (security validation happened first)
            expect(mockExecutor.execute).not.toHaveBeenCalled();
        });

        it('should accept valid version family input only', async () => {
            // SECURITY TEST: Ensure only digits are accepted
            // Given: Valid version families
            const validInputs = ['18', '20', '22', '24'];

            mockExecutor.execute.mockResolvedValue({
                stdout: 'v20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: Each valid input is tested
            for (const validInput of validInputs) {
                await manager.checkVersionSatisfaction(validInput);
            }

            // Then: Command was executed for each valid input
            expect(mockExecutor.execute).toHaveBeenCalledTimes(validInputs.length);
        });
    });
});
