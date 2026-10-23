import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createMockExecaSubprocess, setupMockDependencies } from './commandExecutor.testUtils';

// Mock execa
jest.mock('execa');
import execa from 'execa';


describe('CommandExecutor - Timeout Handling', () => {
    let commandExecutor: CommandExecutor;
    const mockExeca = execa as jest.MockedFunction<typeof execa>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating instances
        const mockDependencies = setupMockDependencies();

        // Now create CommandExecutor - it will use our mocks
        commandExecutor = new CommandExecutor(mockDependencies.deps);
    });

    describe('timeout handling', () => {
        it('should handle execa timeout errors', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess);

            // Use streaming mode for cleaner timeout testing (bypasses retry)
            const promise = commandExecutor.execute('sleep 100', {
                timeout: 1000,
                streaming: true,
                onOutput: () => {}
            });

            // Simulate execa timeout error
            setImmediate(() => {
                const timeoutError = Object.assign(new Error('Command timed out'), { timedOut: true });
                mockSubprocess._reject(timeoutError);
            });

            await expect(promise).rejects.toThrow('Command timed out after 1000ms');
        });

        it('should pass timeout option to execa', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess);

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
            mockExeca.mockReturnValue(mockSubprocess);

            const promise = commandExecutor.execute('long-command', {
                streaming: true,
                onOutput: () => {}
            });

            // Simulate execa canceled error
            setImmediate(() => {
                const canceledError = Object.assign(new Error('Command was canceled'), { isCanceled: true });
                mockSubprocess._reject(canceledError);
            });

            await expect(promise).rejects.toThrow('Command was canceled');
        });

        it('should handle killed commands', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess);

            const promise = commandExecutor.execute('long-command', {
                streaming: true,
                onOutput: () => {}
            });

            // Simulate execa killed error
            setImmediate(() => {
                const killedError = Object.assign(new Error('Command was killed'), { killed: true });
                mockSubprocess._reject(killedError);
            });

            await expect(promise).rejects.toThrow('Command was killed');
        });

        // A command runs as shell → `fnm exec` → the tool. execa's timeout kills the
        // shell only, and a timed-out `aio auth login` kept running with its sign-in
        // listener open (2026-10-23). Its own process group lets the whole of it stop.
        it('starts each command in its own process group and stops that group on a timeout', async () => {
            const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess);

            const promise = commandExecutor.execute('aio auth login', {
                timeout: 1000,
                streaming: true,
                onOutput: () => {},
            });
            setImmediate(() => mockSubprocess._resolve({ exitCode: null, timedOut: true }));

            await expect(promise).rejects.toThrow('Command timed out after 1000ms');
            expect(mockExeca).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ detached: true }));
            expect(killSpy).toHaveBeenCalledWith(-mockSubprocess.pid, 'SIGTERM');
            killSpy.mockRestore();
        });

        it('stops the whole group when the command is cancelled', async () => {
            const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess);
            const controller = new AbortController();

            const promise = commandExecutor.execute('aio auth login', {
                streaming: true,
                onOutput: () => {},
                signal: controller.signal,
            });
            setImmediate(() => {
                controller.abort();
                mockSubprocess._resolve({ exitCode: null });
            });
            await promise;

            expect(mockSubprocess.kill).toHaveBeenCalled();
            expect(killSpy).toHaveBeenCalledWith(-mockSubprocess.pid, 'SIGTERM');
            killSpy.mockRestore();
        });

        it('should reject timeout below minimum threshold', async () => {
            await expect(
                commandExecutor.execute('echo test', { timeout: 500 })
            ).rejects.toThrow('Timeout must be at least 1000ms');
        });
    });
});
