/**
 * CommandExecutor Cancellation Tests - AbortController Integration
 *
 * Tests for the new AbortController-based command cancellation feature.
 * This allows callers to cancel long-running commands gracefully.
 */

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

// Helper to wait for setImmediate
const waitForImmediate = () => new Promise(resolve => setImmediate(resolve));

describe('CommandExecutor - Cancellation (AbortController)', () => {
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

    describe('AbortController signal support', () => {
        it('should accept AbortSignal in execute options', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const controller = new AbortController();

            const promise = commandExecutor.execute('echo test', {
                streaming: true,
                onOutput: () => {},
                signal: controller.signal
            });

            // Complete normally (synchronous)
            mockSubprocess.stdout.emit('data', Buffer.from('test\n'));
            mockSubprocess._resolve({ exitCode: 0 });

            const result = await promise;
            expect(result.code).toBe(0);
        });

        it('should cancel command when AbortController is aborted', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const controller = new AbortController();

            const promise = commandExecutor.execute('long-running-command', {
                streaming: true,
                onOutput: () => {},
                signal: controller.signal
            });

            // Wait for listener registration, then abort
            await waitForImmediate();
            controller.abort();

            // Simulate execa's canceled error response (deferred to allow handler attachment)
            setImmediate(() => {
                const canceledError = new Error('Command was canceled') as any;
                canceledError.isCanceled = true;
                mockSubprocess._reject(canceledError);
            });

            await expect(promise).rejects.toThrow('Command was canceled');
            expect(mockSubprocess.kill).toHaveBeenCalled();
        });

        it('should call subprocess.kill() when signal is aborted', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const controller = new AbortController();

            const promise = commandExecutor.execute('long-running-command', {
                streaming: true,
                onOutput: () => {},
                signal: controller.signal
            });

            // Wait for listener registration, then abort
            await waitForImmediate();
            controller.abort();

            // Verify kill was called
            expect(mockSubprocess.kill).toHaveBeenCalled();

            // Complete the promise (deferred to allow handler attachment)
            setImmediate(() => {
                const canceledError = new Error('Command was canceled') as any;
                canceledError.isCanceled = true;
                mockSubprocess._reject(canceledError);
            });

            // Catch the expected rejection
            await promise.catch(() => {});
        });

        it('should clean up abort listener after command completes', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const controller = new AbortController();
            const removeEventListenerSpy = jest.spyOn(controller.signal, 'removeEventListener');

            const promise = commandExecutor.execute('echo test', {
                streaming: true,
                onOutput: () => {},
                signal: controller.signal
            });

            // Complete successfully
            mockSubprocess.stdout.emit('data', Buffer.from('test\n'));
            mockSubprocess._resolve({ exitCode: 0 });

            await promise;

            // The finally callback should have removed the listener
            expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));
        });

        it('should work without signal option (backwards compatible)', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const promise = commandExecutor.execute('echo test', {
                streaming: true,
                onOutput: () => {}
                // No signal option
            });

            // Complete normally
            mockSubprocess.stdout.emit('data', Buffer.from('test\n'));
            mockSubprocess._resolve({ exitCode: 0 });

            const result = await promise;
            expect(result.code).toBe(0);
        });
    });

    describe('AbortController with non-streaming execution', () => {
        it('should support signal option in non-streaming mode', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const controller = new AbortController();

            const promise = commandExecutor.execute('echo test', {
                signal: controller.signal
                // No streaming option
            });

            // Complete normally
            mockSubprocess.stdout.emit('data', Buffer.from('test\n'));
            mockSubprocess._resolve({ exitCode: 0 });

            const result = await promise;
            expect(result.code).toBe(0);
        });

        it('should cancel non-streaming command when aborted', async () => {
            const mockSubprocess = createMockExecaSubprocess();
            mockExeca.mockReturnValue(mockSubprocess as any);

            const controller = new AbortController();

            const promise = commandExecutor.execute('slow-command', {
                signal: controller.signal
            });

            // Wait for listener registration, then abort
            await waitForImmediate();
            controller.abort();

            // Verify kill was called
            expect(mockSubprocess.kill).toHaveBeenCalled();

            // Simulate canceled error (deferred to allow handler attachment)
            setImmediate(() => {
                const canceledError = new Error('Command was canceled') as any;
                canceledError.isCanceled = true;
                mockSubprocess._reject(canceledError);
            });

            await expect(promise).rejects.toThrow('Command was canceled');
        });
    });
});
