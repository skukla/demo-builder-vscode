import { CommandExecutor } from '@/core/shell/commandExecutor';
import { CommandSequencer } from '@/core/shell/commandSequencer';
import { PollingService } from '@/core/shell/pollingService';
import { setupMockDependencies } from './commandExecutor.testUtils';

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

describe('CommandExecutor - Service Delegation', () => {
    let commandExecutor: CommandExecutor;
    let mockDependencies: ReturnType<typeof setupMockDependencies>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating instances
        mockDependencies = setupMockDependencies();

        // Now create CommandExecutor - it will use our mocks
        commandExecutor = new CommandExecutor();
    });

    describe('executeExclusive', () => {
        it('should delegate to resource locker', async () => {
            const operation = jest.fn().mockResolvedValue('result');

            await commandExecutor.executeExclusive('resource1', operation);

            expect(mockDependencies.mockResourceLocker().executeExclusive).toHaveBeenCalledWith(
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
