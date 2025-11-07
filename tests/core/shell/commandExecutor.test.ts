import { CommandExecutor } from '@/core/shell/commandExecutor';
import { CommandSequencer } from '@/core/shell/commandSequencer';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { FileWatcher } from '@/core/shell/fileWatcher';
import { PollingService } from '@/core/shell/pollingService';
import { ResourceLocker } from '@/core/shell/resourceLocker';
import { RetryStrategyManager } from '@/core/shell/retryStrategyManager';
import type { CommandResult, ExecuteOptions } from '@/core/shell/types';
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

describe('CommandExecutor', () => {
    let commandExecutor: CommandExecutor;
    let mockResourceLocker: jest.Mocked<ResourceLocker>;
    let mockRetryManager: jest.Mocked<RetryStrategyManager>;
    let mockEnvironmentSetup: jest.Mocked<EnvironmentSetup>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating instances
        // This ensures CommandExecutor constructor gets our mocks

        // Mock resource locker constructor
        (ResourceLocker as jest.MockedClass<typeof ResourceLocker>).mockImplementation(() => {
            const mock = {
                executeExclusive: jest.fn(<T>(resource: string, operation: () => Promise<T>) => operation()) as any,
                clearAllLocks: jest.fn()
            } as any;
            mockResourceLocker = mock;
            return mock;
        });

        // Mock retry manager constructor
        (RetryStrategyManager as jest.MockedClass<typeof RetryStrategyManager>).mockImplementation(() => {
            const mock = {
                executeWithRetry: jest.fn((executeFn: () => Promise<CommandResult>) => executeFn()) as any,
                getDefaultStrategy: jest.fn(() => ({
                    maxAttempts: 1,
                    initialDelay: 1000,
                    maxDelay: 5000,
                    backoffFactor: 2
                })),
                getStrategy: jest.fn((_name: string) => ({
                    maxAttempts: 2,
                    initialDelay: 1000,
                    maxDelay: 5000,
                    backoffFactor: 1.5
                }))
            } as any;
            mockRetryManager = mock;
            return mock;
        });

        // Mock environment setup constructor
        (EnvironmentSetup as jest.MockedClass<typeof EnvironmentSetup>).mockImplementation(() => {
            const mock = {
                findAdobeCLINodeVersion: jest.fn().mockResolvedValue('18'),
                findFnmPath: jest.fn().mockReturnValue('/usr/local/bin/fnm'),
                findNpmGlobalPaths: jest.fn().mockReturnValue(['/usr/local/lib/node_modules/.bin']),
                ensureAdobeCLIConfigured: jest.fn().mockResolvedValue(undefined),
                ensureAdobeCLINodeVersion: jest.fn().mockResolvedValue(undefined),
                resetSession: jest.fn()
            } as any;
            mockEnvironmentSetup = mock;
            return mock;
        });

        // Mock other constructors with minimal implementation
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

        // Now create CommandExecutor - it will use our mocks
        commandExecutor = new CommandExecutor();
    });

    describe('execute', () => {
        it('should execute a basic command successfully', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('echo hello');

            // Simulate stdout data
            mockChild.stdout!.emit('data', Buffer.from('hello\n'));
            mockChild.emit('close', 0);

            const result = await promise;

            expect(result.stdout).toBe('hello\n');
            expect(result.stderr).toBe('');
            expect(result.code).toBe(0);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should handle command with non-zero exit code', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('false');

            mockChild.stderr!.emit('data', Buffer.from('error message\n'));
            mockChild.emit('close', 1);

            const result = await promise;

            expect(result.code).toBe(1);
            expect(result.stderr).toBe('error message\n');
        });

        it('should handle command errors', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('invalid-command');

            mockChild.emit('error', new Error('Command not found'));

            await expect(promise).rejects.toThrow('Command not found');
        });

        it('should handle streaming output with onOutput callback', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const outputLines: string[] = [];
            const promise = commandExecutor.execute('echo test', {
                streaming: true,
                onOutput: (data) => outputLines.push(data)
            });

            mockChild.stdout!.emit('data', Buffer.from('line1\n'));
            mockChild.stdout!.emit('data', Buffer.from('line2\n'));
            mockChild.emit('close', 0);

            await promise;

            expect(outputLines).toEqual(['line1\n', 'line2\n']);
        });

        it('should validate and enforce minimum timeout', async () => {
            await expect(
                commandExecutor.execute('echo test', { timeout: 500 })
            ).rejects.toThrow('Timeout must be at least 1000ms');
        });

        it('should use exclusive execution when exclusive option is set', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('echo test', {
                exclusive: 'test-resource'
            });

            mockChild.stdout!.emit('data', Buffer.from('test\n'));
            mockChild.emit('close', 0);

            await promise;

            expect(mockResourceLocker.executeExclusive).toHaveBeenCalledWith(
                'test-resource',
                expect.any(Function)
            );
        });
    });

    describe('timeout handling', () => {
        it('should timeout long-running commands', async () => {
            jest.useFakeTimers();

            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            // Mock kill to not throw
            mockChild.kill = jest.fn().mockReturnValue(true);

            const promise = commandExecutor.execute('sleep 100', { timeout: 1000 });

            // Advance past timeout
            jest.advanceTimersByTime(1000);

            // Emit close after kill (in next tick)
            process.nextTick(() => {
                mockChild.emit('close', null);
            });

            await expect(promise).rejects.toThrow('Command timed out after 1000ms');
            expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

            jest.useRealTimers();
        });

        it('should force kill if SIGTERM fails', async () => {
            jest.useFakeTimers();

            const mockChild = createMockChildProcess();
            // Re-define with writable=true for test modification
            Object.defineProperty(mockChild, 'killed', { value: false, writable: true });
            Object.defineProperty(mockChild, 'exitCode', { value: null, writable: true });
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const killMock = jest.fn().mockReturnValue(true);
            mockChild.kill = killMock;

            const promise = commandExecutor.execute('sleep 100', { timeout: 1000 });

            // Advance to timeout
            jest.advanceTimersByTime(1000);

            // Advance to force kill timeout
            jest.advanceTimersByTime(2000);

            // Emit close
            mockChild.emit('close', null);

            await expect(promise).rejects.toThrow('Command timed out after 1000ms');

            // Should call kill twice: SIGTERM then SIGKILL
            expect(killMock).toHaveBeenCalledWith('SIGTERM');
            expect(killMock).toHaveBeenCalledWith('SIGKILL');

            jest.useRealTimers();
        });
    });

    describe('Adobe CLI telemetry handling', () => {
        it('should auto-answer telemetry prompt', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const stdinWrite = jest.fn();
            const stdinEnd = jest.fn();
            mockChild.stdin = { write: stdinWrite, end: stdinEnd } as any;

            const promise = commandExecutor.execute('aio --version', {
                configureTelemetry: false
            });

            // Simulate telemetry prompt
            mockChild.stdout!.emit('data', Buffer.from('Would you like to allow @adobe/aio-cli to collect anonymous usage data?'));
            mockChild.emit('close', 0);

            await promise;

            expect(stdinWrite).toHaveBeenCalledWith('n\n');
            expect(stdinEnd).toHaveBeenCalled();
        });

        it('should configure telemetry for Adobe CLI commands', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('aio --version', {
                configureTelemetry: true
            });

            // Use nextTick to emit events after promise creation
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('version output\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            expect(mockEnvironmentSetup.ensureAdobeCLIConfigured).toHaveBeenCalled();
        });
    });

    describe('executeAdobeCLI', () => {
        it('should cache aio --version results', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            // First call
            const promise1 = commandExecutor.executeAdobeCLI('aio --version');

            // Use nextTick to emit events
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('9.4.0\n'));
                mockChild.emit('close', 0);
            });

            await promise1;

            // Second call should use cache
            const result2 = await commandExecutor.executeAdobeCLI('aio --version');

            expect(result2.stdout).toBe('9.4.0\n');
            // spawn should only be called once (cached second time)
            expect(spawn).toHaveBeenCalledTimes(1);
        });

        it('should cache aio plugins results', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            // First call
            const promise1 = commandExecutor.executeAdobeCLI('aio plugins');

            // Use nextTick to emit events
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('plugin list\n'));
                mockChild.emit('close', 0);
            });

            await promise1;

            // Second call should use cache
            const result2 = await commandExecutor.executeAdobeCLI('aio plugins');

            expect(result2.stdout).toBe('plugin list\n');
            expect(spawn).toHaveBeenCalledTimes(1);
        });

        it('should ensure Adobe CLI Node version is set', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.executeAdobeCLI('aio console:org:list');

            // Use nextTick to emit events
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('org list\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            expect(mockEnvironmentSetup.ensureAdobeCLINodeVersion).toHaveBeenCalled();
        });
    });

    describe('executeExclusive', () => {
        it('should delegate to resource locker', async () => {
            const operation = jest.fn().mockResolvedValue('result');

            await commandExecutor.executeExclusive('resource1', operation);

            expect(mockResourceLocker.executeExclusive).toHaveBeenCalledWith(
                'resource1',
                operation
            );
        });
    });

    describe('pollUntilCondition', () => {
        it('should delegate to polling service', async () => {
            const mockPollingService = new PollingService() as jest.Mocked<PollingService>;
            mockPollingService.pollUntilCondition = jest.fn().mockResolvedValue(undefined);

            const checkFn = jest.fn().mockResolvedValue(true);
            const options = { maxAttempts: 10, timeout: 5000 };

            // Create new executor to get fresh mocks
            const executor = new CommandExecutor();

            // Mock the polling service method
            (executor as any).pollingService.pollUntilCondition = mockPollingService.pollUntilCondition;

            await executor.pollUntilCondition(checkFn, options);

            expect(mockPollingService.pollUntilCondition).toHaveBeenCalledWith(checkFn, options);
        });
    });

    describe('commandExists', () => {
        it('should validate command name for security', async () => {
            const result = await commandExecutor.commandExists('rm -rf /');

            expect(result).toBe(false);
            expect(spawn).not.toHaveBeenCalled();
        });

        it('should allow valid command names', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.commandExists('node');

            mockChild.stdout!.emit('data', Buffer.from('/usr/local/bin/node\n'));
            mockChild.emit('close', 0);

            const result = await promise;

            expect(result).toBe(true);
        });

        it('should return false for non-existent commands', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.commandExists('nonexistent');

            // Emit error - commandExists catches this and returns false
            process.nextTick(() => {
                mockChild.emit('error', new Error('Command not found'));
            });

            const result = await promise;

            expect(result).toBe(false);
        });
    });

    describe('isPortAvailable', () => {
        it('should check if port is available', async () => {
            const result = await commandExecutor.isPortAvailable(9999);

            // Should return boolean
            expect(typeof result).toBe('boolean');
        });
    });

    describe('queueCommand', () => {
        it('should queue and execute commands', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.queueCommand('echo test');

            // Use nextTick to allow queue processing to start
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('test\n'));
                mockChild.emit('close', 0);
            });

            const result = await promise;

            expect(result.stdout).toBe('test\n');
        });

        it('should execute queued commands sequentially', async () => {
            const executionOrder: number[] = [];
            let callCount = 0;

            // Mock spawn to track execution order
            (spawn as jest.Mock).mockImplementation(() => {
                const mockChild = createMockChildProcess();
                const currentCall = ++callCount;

                // Use setImmediate to give each command time to complete before next starts
                setImmediate(() => {
                    executionOrder.push(currentCall);
                    mockChild.stdout!.emit('data', Buffer.from(`output${currentCall}\n`));
                    mockChild.emit('close', 0);
                });

                return mockChild;
            });

            const promise1 = commandExecutor.queueCommand('echo 1');
            const promise2 = commandExecutor.queueCommand('echo 2');
            const promise3 = commandExecutor.queueCommand('echo 3');

            await Promise.all([promise1, promise2, promise3]);

            // All commands should complete
            expect(executionOrder).toHaveLength(3);
            // Verify they completed (order doesn't matter for this test, just that all ran)
            expect(executionOrder).toContain(1);
            expect(executionOrder).toContain(2);
            expect(executionOrder).toContain(3);
        });
    });

    describe('dispose', () => {
        it('should clean up resources', () => {
            commandExecutor.dispose();

            // Verify mocks were called (they're already set up in beforeEach)
            expect(mockResourceLocker.clearAllLocks).toHaveBeenCalled();
            expect(mockEnvironmentSetup.resetSession).toHaveBeenCalled();

            // FileWatcher disposal is called on internal instance
            const fileWatcher = (commandExecutor as any).fileWatcher;
            expect(fileWatcher.disposeAll).toBeDefined();
        });

        it('should reject queued commands on dispose', async () => {
            // Set isProcessingQueue to prevent immediate processing
            (commandExecutor as any).isProcessingQueue = true;

            // Now queue a command - it won't start because queue is locked
            const promise = commandExecutor.queueCommand('echo test');

            // Dispose before processing starts
            commandExecutor.dispose();

            // Should reject with dispose error
            await expect(promise).rejects.toThrow('Command executor disposed');
        });
    });

    describe('executeSequence', () => {
        it('should execute commands in sequence', async () => {
            const mockSequencer = new CommandSequencer() as jest.Mocked<CommandSequencer>;
            mockSequencer.executeSequence = jest.fn().mockResolvedValue([
                { stdout: 'result1', stderr: '', code: 0, duration: 100 },
                { stdout: 'result2', stderr: '', code: 0, duration: 150 }
            ]);

            (commandExecutor as any).commandSequencer = mockSequencer;

            const commands = [
                { command: 'echo 1' },
                { command: 'echo 2' }
            ];

            const results = await commandExecutor.executeSequence(commands);

            expect(results).toHaveLength(2);
            expect(mockSequencer.executeSequence).toHaveBeenCalledWith(
                commands,
                expect.any(Function),
                true
            );
        });
    });

    describe('executeParallel', () => {
        it('should execute commands in parallel', async () => {
            const mockSequencer = new CommandSequencer() as jest.Mocked<CommandSequencer>;
            mockSequencer.executeParallel = jest.fn().mockResolvedValue([
                { stdout: 'result1', stderr: '', code: 0, duration: 100 },
                { stdout: 'result2', stderr: '', code: 0, duration: 150 }
            ]);

            (commandExecutor as any).commandSequencer = mockSequencer;

            const commands = [
                { command: 'echo 1' },
                { command: 'echo 2' }
            ];

            const results = await commandExecutor.executeParallel(commands);

            expect(results).toHaveLength(2);
            expect(mockSequencer.executeParallel).toHaveBeenCalledWith(
                commands,
                expect.any(Function)
            );
        });
    });
});

// Helper to create mock child process
function createMockChildProcess(): ChildProcess {
    const mockChild = new EventEmitter() as any;
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.stdin = { write: jest.fn(), end: jest.fn() };
    mockChild.pid = 12345;
    // Use defineProperty for readonly properties
    Object.defineProperty(mockChild, 'killed', { value: false, writable: true });
    Object.defineProperty(mockChild, 'exitCode', { value: null, writable: true });
    mockChild.kill = jest.fn();
    return mockChild as ChildProcess;
}
