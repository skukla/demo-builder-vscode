import { checkPerNodeVersionStatus } from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockContext } from './testHelpers';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';
import type { CommandExecutor } from '@/core/shell';
import type { CommandResult } from '@/core/shell/types';

/**
 * Prerequisites Handlers - Per-Node-Version Status Test Suite
 *
 * Tests the checkPerNodeVersionStatus utility function.
 * This function checks prerequisite status for each required Node version.
 *
 * Total tests: 13
 */

// Helper to create mock CommandResult
function createCommandResult(stdout: string, stderr = '', code = 0): CommandResult {
    return {
        stdout,
        stderr,
        code,
        duration: 100,
    };
}

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
        getNodeVersionManager: jest.fn(),
        reset: jest.fn(),
    },
}));

describe('Prerequisites Handlers - checkPerNodeVersionStatus', () => {
    let mockCommandExecutor: jest.Mocked<Pick<CommandExecutor, 'execute'>>;

    beforeEach(() => {
        mockCommandExecutor = {
            execute: jest.fn(),
        };
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should execute fnm list with shell option in shared handler', async () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            perNodeVersion: true,
            check: {
                command: 'aio --version',
                parseVersion: '@adobe/aio-cli/(\\S+)',
            },
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0\nv20.0.0'));
            }
            return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
        });

        const context = createMockContext();
        await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

        // Verify fnm list was called with shell option
        expect(mockCommandExecutor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({
            shell: expect.any(String), // Expects shell path (e.g., '/bin/bash')
            timeout: expect.any(Number),
        }));
    });

    it('should parse fnm list output correctly in shared handler', async () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            perNodeVersion: true,
            check: {
                command: 'aio --version',
                parseVersion: '@adobe/aio-cli/(\\S+)',
            },
        } as PrerequisiteDefinition;

        // fnm list output with various formats
        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.20.8\nv20.19.5\nv24.0.0'));
            }
            return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
        });

        const context = createMockContext();
        const result = await checkPerNodeVersionStatus(prereq, ['18', '20', '24'], context);

        expect(result.perNodeVersionStatus).toEqual([
            { version: 'Node 18', component: '10.0.0', installed: true, major: '18' },
            { version: 'Node 20', component: '10.0.0', installed: true, major: '20' },
            { version: 'Node 24', component: '10.0.0', installed: true, major: '24' },
        ]);
        expect(mockCommandExecutor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({ shell: expect.any(String) }));
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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0\nv20.0.0'));
            }
            return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
        });

        const context = createMockContext();
        const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

        expect(result.perNodeVersionStatus).toEqual([
            { version: 'Node 18', component: '10.0.0', installed: true, major: '18' },
            { version: 'Node 20', component: '10.0.0', installed: true, major: '20' },
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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
            }
            return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0')); // Only 18 installed
            }
            return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
        });

        const context = createMockContext();
        const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

        expect(result.perNodeVersionStatus).toHaveLength(2);
        expect(result.perNodeVersionStatus[1]).toEqual({
            version: 'Node 20',
            component: '',
            installed: false,
            major: '20',
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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
            }
            return Promise.resolve(createCommandResult('@adobe/aio-cli/11.2.3\nNode: v18.0.0'));
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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
            }
            return Promise.resolve(createCommandResult('version 10.0.0'));
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
        } as PrerequisiteDefinition;

        let callCount = 0;
        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0\nv20.0.0'));
            }
            callCount++;
            if (callCount === 1) {
                return Promise.resolve(createCommandResult('version 10.0.0')); // 18 installed
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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
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
        } as PrerequisiteDefinition;

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
        } as PrerequisiteDefinition;

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
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult(''));
            }
            return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
        });

        const context = createMockContext();
        await checkPerNodeVersionStatus(prereq, ['20'], context);

        expect(context.logger.debug).toHaveBeenCalledWith(
            expect.stringMatching(/Node 20 not installed, skipping Adobe I\/O CLI check/)
        );
    });

    it('should handle version parsing failure gracefully', async () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            perNodeVersion: true,
            check: {
                command: 'aio --version',
                parseVersion: '@adobe/aio-cli/(\\S+)',
            },
        } as PrerequisiteDefinition;

        mockCommandExecutor.execute.mockImplementation((cmd: string) => {
            if (cmd === 'fnm list') {
                return Promise.resolve(createCommandResult('v18.0.0'));
            }
            return Promise.resolve(createCommandResult('unexpected output format'));
        });

        const context = createMockContext();
        const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

        expect(result.perNodeVersionStatus[0].component).toBe('');
        expect(result.perNodeVersionStatus[0].installed).toBe(true);
    });

    describe('exit code checking (Step 1 - Bug Fix)', () => {
        it('should detect tool as NOT installed when command exits with non-zero code', async () => {
            // Given: Adobe CLI prerequisite
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\S+)',
                },
            } as PrerequisiteDefinition;

            // Given: Command returns non-zero exit code (127 = command not found)
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0', '', 0));
                }
                // Command exits with code 127 (not installed)
                return Promise.resolve(createCommandResult('', 'aio: command not found', 127));
            });

            const context = createMockContext();

            // When: Check per-node version status
            const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

            // Then: Should detect as NOT installed
            expect(result.perNodeVersionStatus).toHaveLength(1);
            expect(result.perNodeVersionStatus[0]).toEqual({
                version: 'Node 18',
                component: '',
                installed: false, // CRITICAL: Should be false when exit code !== 0
                major: '18',
            });
            expect(result.perNodeVariantMissing).toBe(true);
            expect(result.missingVariantMajors).toEqual(['18']);
        });

        it('should detect tool as installed when command exits with zero code', async () => {
            // Given: Adobe CLI prerequisite
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\S+)',
                },
            } as PrerequisiteDefinition;

            // Given: Command returns zero exit code (success)
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0', '', 0));
                }
                // Command exits with code 0 (success)
                return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0', '', 0));
            });

            const context = createMockContext();

            // When: Check per-node version status
            const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

            // Then: Should detect as installed with parsed version
            expect(result.perNodeVersionStatus).toHaveLength(1);
            expect(result.perNodeVersionStatus[0]).toEqual({
                version: 'Node 18',
                component: '10.0.0', // Parsed from output
                installed: true, // CRITICAL: Should be true when exit code === 0
                major: '18',
            });
            expect(result.perNodeVariantMissing).toBe(false);
            expect(result.missingVariantMajors).toEqual([]);
        });
    });
});
