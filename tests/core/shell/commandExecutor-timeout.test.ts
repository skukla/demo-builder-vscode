import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createMockExecaSubprocess, setupMockDependencies } from './commandExecutor.testUtils';

// Mock execa
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

describe('CommandExecutor - Timeout Handling', () => {
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

    describe('timeout handling', () => {
        it('should handle execa timeout errors', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            // Use streaming mode for cleaner timeout testing (bypasses retry)
            const promise = commandExecutor.execute('sleep 100', {
                timeout: 1000,
                streaming: true,
                onOutput: () => {}
            });

            // Simulate execa timeout error
            setImmediate(() => {
                const timeoutError = new Error('Command timed out') as any;
                timeoutError.timedOut = true;
                mockSubprocess._reject(timeoutError);
            });

            await expect(promise).rejects.toThrow('Command timed out after 1000ms');
        });

        it('should pass timeout option to execa', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.execute('echo test', {
                timeout: 5000,
                streaming: true,
                onOutput: () => {}
            });

            // Complete successfully
            setImmediate(() => {
                mockSubprocess.stdout.emit('data', Buffer.from('test\n'));
                mockSubprocess._resolve({ exitCode: 0 });
            });

            await promise;

            // Verify execa was called with timeout option
            expect(mockExeca).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    timeout: 5000
                })
            );
        });

        it('should handle canceled commands', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.execute('long-command', {
                streaming: true,
                onOutput: () => {}
            });

            // Simulate execa canceled error
            setImmediate(() => {
                const canceledError = new Error('Command was canceled') as any;
                canceledError.isCanceled = true;
                mockSubprocess._reject(canceledError);
            });

            await expect(promise).rejects.toThrow('Command was canceled');
        });

        it('should handle killed commands', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.execute('long-command', {
                streaming: true,
                onOutput: () => {}
            });

            // Simulate execa killed error
            setImmediate(() => {
                const killedError = new Error('Command was killed') as any;
                killedError.killed = true;
                mockSubprocess._reject(killedError);
            });

            await expect(promise).rejects.toThrow('Command was killed');
        });

        it('should reject timeout below minimum threshold', async () => {
            await expect(
                commandExecutor.execute('echo test', { timeout: 500 })
            ).rejects.toThrow('Timeout must be at least 1000ms');
        });
    });
});
