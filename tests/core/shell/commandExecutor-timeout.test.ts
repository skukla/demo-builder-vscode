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

describe('CommandExecutor - Timeout Handling', () => {
    let commandExecutor: CommandExecutor;
    let mockDependencies: ReturnType<typeof setupMockDependencies>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating instances
        mockDependencies = setupMockDependencies();

        // Now create CommandExecutor - it will use our mocks
        commandExecutor = new CommandExecutor();
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
});
