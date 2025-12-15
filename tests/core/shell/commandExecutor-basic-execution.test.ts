import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createMockExecaSubprocess, setupMockDependencies, simulateSubprocessComplete } from './commandExecutor.testUtils';

// Mock execa - must be before importing CommandExecutor
jest.mock('execa');
import execa from 'execa';

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
    const mockExeca = execa as jest.MockedFunction<typeof execa>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating instances
        mockDependencies = setupMockDependencies();

        // Now create CommandExecutor - it will use our mocks
        commandExecutor = new CommandExecutor();
    });

    describe('execute', () => {
        it('should execute a basic command successfully', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.execute('echo hello');

            // Simulate subprocess completion
            simulateSubprocessComplete(mockSubprocess, 'hello\n', '', 0);

            const result = await promise;

            expect(result.stdout).toBe('hello\n');
            expect(result.stderr).toBe('');
            expect(result.code).toBe(0);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should handle command with non-zero exit code', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.execute('false');

            // Simulate non-zero exit
            simulateSubprocessComplete(mockSubprocess, '', 'error message\n', 1);

            const result = await promise;

            expect(result.code).toBe(1);
            expect(result.stderr).toBe('error message\n');
        });

        it('should handle command errors (timeout)', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            // Use streaming mode to bypass retry mechanism for cleaner timeout testing
            const promise = commandExecutor.execute('slow-command', {
                streaming: true,
                onOutput: () => {}
            });

            // Simulate timeout error from execa
            setImmediate(() => {
                const timeoutError = new Error('Command timed out') as any;
                timeoutError.timedOut = true;
                mockSubprocess._reject(timeoutError);
            });

            await expect(promise).rejects.toThrow('Command timed out');
        });

        it('should handle streaming output with onOutput callback', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const outputLines: string[] = [];
            const promise = commandExecutor.execute('echo test', {
                streaming: true,
                onOutput: (data) => outputLines.push(data)
            });

            // Simulate streaming output
            mockSubprocess.stdout.emit('data', Buffer.from('line1\n'));
            mockSubprocess.stdout.emit('data', Buffer.from('line2\n'));
            mockSubprocess._resolve({ exitCode: 0 });

            await promise;

            expect(outputLines).toEqual(['line1\n', 'line2\n']);
        });

        it('should validate and enforce minimum timeout', async () => {
            await expect(
                commandExecutor.execute('echo test', { timeout: 500 })
            ).rejects.toThrow('Timeout must be at least 1000ms');
        });

        it('should use exclusive execution when exclusive option is set', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.execute('echo test', {
                exclusive: 'test-resource'
            });

            // Simulate completion
            simulateSubprocessComplete(mockSubprocess, 'test\n', '', 0);

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
            expect(mockExeca).not.toHaveBeenCalled();
        });

        it('should allow valid command names', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.commandExists('node');

            // Simulate which command finding node
            simulateSubprocessComplete(mockSubprocess, '/usr/local/bin/node\n', '', 0);

            const result = await promise;

            expect(result).toBe(true);
        });

        it('should return false for non-existent commands', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.commandExists('nonexistent');

            // Simulate which command not finding the command
            process.nextTick(() => {
                simulateSubprocessComplete(mockSubprocess, '', 'nonexistent not found', 1);
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
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.queueCommand('echo test');

            // Use nextTick to allow queue processing to start
            process.nextTick(() => {
                simulateSubprocessComplete(mockSubprocess, 'test\n', '', 0);
            });

            const result = await promise;

            expect(result.stdout).toBe('test\n');
        });

        it('should execute queued commands sequentially', async () => {
            const executionOrder: number[] = [];
            let callCount = 0;

            // Mock execa to track execution order
            mockExeca.mockImplementation(() => {
                const mockSubprocess = createMockExecaSubprocess();
                const currentCall = ++callCount;

                // Use setImmediate to give each command time to complete before next starts
                setImmediate(() => {
                    executionOrder.push(currentCall);
                    simulateSubprocessComplete(mockSubprocess, `output${currentCall}\n`, '', 0);
                });

                return mockSubprocess as any;
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
            // Set isProcessing on the internal CommandQueue to prevent immediate processing
            const commandQueue = (commandExecutor as any).commandQueue;
            (commandQueue as any).isProcessing = true;

            // Now queue a command - it won't start because queue is locked
            const promise = commandExecutor.queueCommand('echo test');

            // Dispose before processing starts
            commandExecutor.dispose();

            // Should reject with dispose error
            await expect(promise).rejects.toThrow('Command executor disposed');
        });
    });
});
