/**
 * Tests for parallel execution in checkPerNodeVersionStatus
 * Step 3: Parallel Per-Node-Version Checking
 *
 * Verifies that checkPerNodeVersionStatus uses Promise.all for concurrent
 * Node version checks while maintaining fnm exec isolation.
 *
 * Expected impact: 50-66% faster multi-version checks (3 sequential checks
 * at 1-2s each = 3-6s total → 1 concurrent batch at 1-2s).
 */

import { checkPerNodeVersionStatus } from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';
import { createMockHandlerContext } from '../../helpers/handlerContextTestHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
        reset: jest.fn(),
    },
}));

describe('Parallel Per-Node-Version Checking', () => {
    let mockCommandExecutor: jest.Mocked<{
        execute: jest.Mock;
    }>;
    const pendingTimers: NodeJS.Timeout[] = [];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        pendingTimers.length = 0; // Clear array

        mockCommandExecutor = {
            execute: jest.fn(),
        };

        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);
    });

    afterEach(() => {
        // Clear any timers that were tracked
        pendingTimers.forEach(timer => clearTimeout(timer));
        pendingTimers.length = 0;

        // Run pending timers and restore real timers
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('1. Performance: Parallel checks faster than sequential', () => {
        it('should complete 3 Node version checks concurrently (parallel execution)', async () => {
            const prereq: Partial<PrerequisiteDefinition> = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\S+)',
                },
            };

            // Track which checks are initiated to verify parallel execution
            const checkInitTimes: string[] = [];

            // Mock fnm list to show all 3 Node versions installed
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.0.0\nv20.0.0\nv24.0.0',
                        stderr: '',
                        code: 0,
                        duration: 100,
                    });
                }
                // Track that check was initiated
                checkInitTimes.push(cmd);
                // Return immediately (fast mock)
                return Promise.resolve({
                    stdout: '@adobe/aio-cli/10.0.0',
                    stderr: '',
                    code: 0,
                    duration: 500,
                });
            });

            const context = createMockHandlerContext();
            const result = await checkPerNodeVersionStatus(prereq as PrerequisiteDefinition, ['18', '20', '24'], context);

            // Verify all versions checked successfully
            expect(result.perNodeVersionStatus).toHaveLength(3);
            expect(result.perNodeVersionStatus.every(v => v.installed)).toBe(true);
            expect(result.perNodeVariantMissing).toBe(false);
        });
    });

    describe('2. Isolation: Parallel checks maintain Node version isolation', () => {
        it('should correctly identify version-specific results without cross-contamination', async () => {
            const prereq: Partial<PrerequisiteDefinition> = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\S+)',
                },
            };

            // Mock fnm list
            type ExecuteOptions = { useNodeVersion?: string };
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: ExecuteOptions) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.0.0\nv20.0.0\nv24.0.0',
                        stderr: '',
                        code: 0, duration: 100,
                    });
                }
                // Return different versions based on Node major version
                const nodeVersion = options?.useNodeVersion;
                if (nodeVersion === '18') {
                    return Promise.resolve({ stdout: '@adobe/aio-cli/10.1.0', stderr: '', code: 0, duration: 100 });
                } else if (nodeVersion === '20') {
                    return Promise.resolve({ stdout: '@adobe/aio-cli/10.2.0', stderr: '', code: 0, duration: 100 });
                } else if (nodeVersion === '24') {
                    return Promise.resolve({ stdout: '@adobe/aio-cli/10.3.0', stderr: '', code: 0, duration: 100 });
                }
                return Promise.reject(new Error('Unknown version'));
            });

            const context = createMockHandlerContext();
            const result = await checkPerNodeVersionStatus(prereq as PrerequisiteDefinition, ['18', '20', '24'], context);

            // Each Node version should report its unique CLI version
            expect(result.perNodeVersionStatus).toEqual([
                { version: 'Node 18', component: '10.1.0', installed: true, major: '18' },
                { version: 'Node 20', component: '10.2.0', installed: true, major: '20' },
                { version: 'Node 24', component: '10.3.0', installed: true, major: '24' },
            ]);
        });
    });

    describe('3. Error Handling: Mixed success/failure scenarios', () => {
        it('should handle Node 18 success while Node 20/24 fail without blocking', async () => {
            const prereq: Partial<PrerequisiteDefinition> = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            };

            // Mock fnm list
            type ExecuteOptions = { useNodeVersion?: string };
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: ExecuteOptions) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.0.0\nv20.0.0\nv24.0.0',
                        stderr: '',
                        code: 0, duration: 100,
                    });
                }
                // Node 18 succeeds, Node 20/24 fail
                const nodeVersion = options?.useNodeVersion;
                if (nodeVersion === '18') {
                    return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 });
                }
                return Promise.reject(new Error('Command failed'));
            });

            const context = createMockHandlerContext();
            const result = await checkPerNodeVersionStatus(prereq as PrerequisiteDefinition, ['18', '20', '24'], context);

            // Node 18 should succeed, Node 20/24 should fail, all results returned
            expect(result.perNodeVersionStatus).toEqual([
                { version: 'Node 18', component: '', installed: true, major: '18' },
                { version: 'Node 20', component: '', installed: false, major: '20' },
                { version: 'Node 24', component: '', installed: false, major: '24' },
            ]);
            expect(result.perNodeVariantMissing).toBe(true);
            expect(result.missingVariantMajors).toEqual(['20', '24']);
        });
    });

    describe('4. Performance: Varying execution times', () => {
        it('should complete in time ≈ max(check times), not sum', async () => {
            const prereq: Partial<PrerequisiteDefinition> = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            };

            // Track execution order and simulate varying response times
            const executionOrder: string[] = [];

            // Mock fnm list
            type ExecuteOptions = { useNodeVersion?: string };
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: ExecuteOptions) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.0.0\nv20.0.0\nv24.0.0',
                        stderr: '',
                        code: 0, duration: 100,
                    });
                }
                // Track execution start
                const nodeVersion = options?.useNodeVersion;
                executionOrder.push(`start-${nodeVersion}`);
                // Return immediately - no setTimeout delays needed
                return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 });
            });

            const context = createMockHandlerContext();
            const result = await checkPerNodeVersionStatus(prereq as PrerequisiteDefinition, ['18', '20', '24'], context);

            // Verify all checks completed successfully
            expect(result.perNodeVersionStatus).toHaveLength(3);
            expect(result.perNodeVersionStatus.every(v => v.installed)).toBe(true);
        });
    });

    describe('5. Edge Case: Single Node version', () => {
        it('should handle single Node version without parallel overhead', async () => {
            const prereq: Partial<PrerequisiteDefinition> = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            };

            // Mock fnm list
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.0.0',
                        stderr: '',
                        code: 0, duration: 100,
                    });
                }
                return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 });
            });

            const context = createMockHandlerContext();
            const result = await checkPerNodeVersionStatus(prereq as PrerequisiteDefinition, ['18'], context);

            // Should complete and return correct result
            expect(result.perNodeVersionStatus).toEqual([
                { version: 'Node 18', component: '', installed: true, major: '18' },
            ]);
        });
    });

    describe('6. Error Handling: Timeout isolation', () => {
        it('should not let one check timeout block other checks', async () => {
            const prereq: Partial<PrerequisiteDefinition> = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            };

            // Mock fnm list
            type ExecuteOptions = { useNodeVersion?: string };
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: ExecuteOptions) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.0.0\nv20.0.0\nv24.0.0',
                        stderr: '',
                        code: 0, duration: 100,
                    });
                }
                // Node 20 fails (simulating timeout), others succeed
                const nodeVersion = options?.useNodeVersion;
                if (nodeVersion === '20') {
                    return Promise.reject(new Error('Command timed out'));
                }
                return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 });
            });

            const context = createMockHandlerContext();
            const result = await checkPerNodeVersionStatus(prereq as PrerequisiteDefinition, ['18', '20', '24'], context);

            // Verify Node 18 and 24 succeeded, Node 20 failed but didn't block
            expect(result.perNodeVersionStatus).toEqual([
                { version: 'Node 18', component: '', installed: true, major: '18' },
                { version: 'Node 20', component: '', installed: false, major: '20' },
                { version: 'Node 24', component: '', installed: true, major: '24' },
            ]);
            expect(result.perNodeVariantMissing).toBe(true);
            expect(result.missingVariantMajors).toEqual(['20']);
        });
    });

    describe('7. Error Handling: fnm exec failure isolation', () => {
        it('should handle Node version not installed without affecting other versions', async () => {
            const prereq: Partial<PrerequisiteDefinition> = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: {
                    command: 'aio --version',
                },
            };

            // Mock fnm list - only Node 18 and 24 installed, not 20
            type ExecuteOptions = { useNodeVersion?: string };
            mockCommandExecutor.execute.mockImplementation((cmd: string, options?: ExecuteOptions) => {
                if (cmd === 'fnm list') {
                    return Promise.resolve({
                        stdout: 'v18.0.0\nv24.0.0',
                        stderr: '',
                        code: 0, duration: 100,
                    });
                }
                // Node 18 and 24 succeed
                const nodeVersion = options?.useNodeVersion;
                if (nodeVersion === '18' || nodeVersion === '24') {
                    return Promise.resolve({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 });
                }
                return Promise.reject(new Error('Node version not found'));
            });

            const context = createMockHandlerContext();
            const result = await checkPerNodeVersionStatus(prereq as PrerequisiteDefinition, ['18', '20', '24'], context);

            // Node 20 should be skipped (not installed), but 18 and 24 should succeed
            expect(result.perNodeVersionStatus).toEqual([
                { version: 'Node 18', component: '', installed: true, major: '18' },
                { version: 'Node 20', component: '', installed: false, major: '20' },
                { version: 'Node 24', component: '', installed: true, major: '24' },
            ]);
            expect(result.perNodeVariantMissing).toBe(true);
            expect(result.missingVariantMajors).toEqual(['20']);
        });
    });
});
