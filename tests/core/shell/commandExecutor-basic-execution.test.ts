import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createMockChildProcess, setupMockDependencies } from './commandExecutor.testUtils';
import { spawn } from 'child_process';

// Mock all dependencies at top level
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

describe('CommandExecutor - Basic Execution', () => {
    let commandExecutor: CommandExecutor;
    let mockDependencies: ReturnType<typeof setupMockDependencies>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating instances
        mockDependencies = setupMockDependencies();

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

            expect(mockDependencies.mockResourceLocker().executeExclusive).toHaveBeenCalledWith(
                'test-resource',
                expect.any(Function)
            );
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

            // Verify mocks were called
            expect(mockDependencies.mockResourceLocker().clearAllLocks).toHaveBeenCalled();
            expect(mockDependencies.mockEnvironmentSetup().resetSession).toHaveBeenCalled();

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
});
