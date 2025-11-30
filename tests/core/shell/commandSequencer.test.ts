import { CommandSequencer } from '@/core/shell/commandSequencer';
import type { CommandResult, CommandConfig } from '@/core/shell/types';

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('CommandSequencer', () => {
    let commandSequencer: CommandSequencer;

    beforeEach(() => {
        jest.clearAllMocks();
        commandSequencer = new CommandSequencer();
    });

    describe('executeSequence', () => {
        it('should execute commands in sequence', async () => {
            const executionOrder: number[] = [];

            const mockExecute = jest.fn(async (command: string, config: CommandConfig): Promise<CommandResult> => {
                const index = parseInt(command.split(' ')[1]);
                executionOrder.push(index);
                await delay(50);
                return {
                    stdout: `result${index}`,
                    stderr: '',
                    code: 0,
                    duration: 50
                };
            });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'echo 2' },
                { command: 'echo 3' }
            ];

            const results = await commandSequencer.executeSequence(commands, mockExecute);

            expect(results).toHaveLength(3);
            expect(executionOrder).toEqual([1, 2, 3]);
            expect(results[0].stdout).toBe('result1');
            expect(results[1].stdout).toBe('result2');
            expect(results[2].stdout).toBe('result3');
        });

        it('should stop on error by default', async () => {
            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'result1', stderr: '', code: 0, duration: 100 })
                .mockRejectedValueOnce(new Error('Command failed'))
                .mockResolvedValueOnce({ stdout: 'result3', stderr: '', code: 0, duration: 100 });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'failing-command' },
                { command: 'echo 3' }
            ];

            await expect(
                commandSequencer.executeSequence(commands, mockExecute)
            ).rejects.toThrow('Command failed');

            expect(mockExecute).toHaveBeenCalledTimes(2);
        });

        it('should continue on error when stopOnError is false', async () => {
            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'result1', stderr: '', code: 0, duration: 100 })
                .mockRejectedValueOnce(new Error('Command failed'))
                .mockResolvedValueOnce({ stdout: 'result3', stderr: '', code: 0, duration: 100 });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'failing-command' },
                { command: 'echo 3' }
            ];

            const results = await commandSequencer.executeSequence(commands, mockExecute, false);

            expect(results).toHaveLength(3);
            expect(results[0].stdout).toBe('result1');
            expect(results[1].code).toBe(1);
            expect(results[1].stderr).toContain('Command failed');
            expect(results[2].stdout).toBe('result3');
        });

        it('should pass config to execute function', async () => {
            const mockExecute = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            });

            const commands: CommandConfig[] = [
                {
                    command: 'echo test',
                    options: { timeout: 5000 },
                    resource: 'test-resource',
                    name: 'Test Command'
                }
            ];

            await commandSequencer.executeSequence(commands, mockExecute);

            expect(mockExecute).toHaveBeenCalledWith('echo test', commands[0]);
        });
    });

    describe('executeParallel', () => {
        it('should execute commands in parallel', async () => {
            const startTimes: number[] = [];

            const mockExecute = jest.fn(async (command: string): Promise<CommandResult> => {
                startTimes.push(Date.now());
                await delay(100);
                return {
                    stdout: command,
                    stderr: '',
                    code: 0,
                    duration: 100
                };
            });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'echo 2' },
                { command: 'echo 3' }
            ];

            const results = await commandSequencer.executeParallel(commands, mockExecute);

            expect(results).toHaveLength(3);

            // All commands should start roughly at the same time (within 50ms)
            const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes);
            expect(maxStartDiff).toBeLessThan(50);
        });

        it('should handle individual command failures gracefully', async () => {
            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'result1', stderr: '', code: 0, duration: 100 })
                .mockRejectedValueOnce(new Error('Command 2 failed'))
                .mockResolvedValueOnce({ stdout: 'result3', stderr: '', code: 0, duration: 100 });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'failing-command' },
                { command: 'echo 3' }
            ];

            const results = await commandSequencer.executeParallel(commands, mockExecute);

            expect(results).toHaveLength(3);
            expect(results[0].code).toBe(0);
            expect(results[1].code).toBe(1);
            expect(results[1].stderr).toContain('Command 2 failed');
            expect(results[2].code).toBe(0);
        });

        it('should return results in order despite varying durations', async () => {
            const mockExecute = jest.fn(async (command: string): Promise<CommandResult> => {
                const index = parseInt(command.split(' ')[1]);
                // Reverse delays: 3rd command finishes first
                await delay(index === 3 ? 50 : index * 100);
                return {
                    stdout: `result${index}`,
                    stderr: '',
                    code: 0,
                    duration: 100
                };
            });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'echo 2' },
                { command: 'echo 3' }
            ];

            const results = await commandSequencer.executeParallel(commands, mockExecute);

            expect(results[0].stdout).toBe('result1');
            expect(results[1].stdout).toBe('result2');
            expect(results[2].stdout).toBe('result3');
        });

        it('should use command names for logging', async () => {
            const mockExecute = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            });

            const commands: CommandConfig[] = [
                { command: 'echo test', name: 'Test Command' }
            ];

            await commandSequencer.executeParallel(commands, mockExecute);

            expect(mockExecute).toHaveBeenCalled();
        });
    });

    describe('executeInBatches', () => {
        it('should execute commands in batches', async () => {
            const activeBatches: Set<number> = new Set();
            const maxConcurrent: number[] = [];

            const mockExecute = jest.fn(async (command: string): Promise<CommandResult> => {
                const index = parseInt(command.split(' ')[1]);
                activeBatches.add(index);
                maxConcurrent.push(activeBatches.size);

                await delay(50);

                activeBatches.delete(index);
                return {
                    stdout: `result${index}`,
                    stderr: '',
                    code: 0,
                    duration: 50
                };
            });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'echo 2' },
                { command: 'echo 3' },
                { command: 'echo 4' },
                { command: 'echo 5' }
            ];

            const results = await commandSequencer.executeInBatches(commands, mockExecute, 2);

            expect(results).toHaveLength(5);

            // Max concurrent should not exceed batch size
            expect(Math.max(...maxConcurrent)).toBeLessThanOrEqual(2);
        });

        it('should handle default batch size', async () => {
            const mockExecute = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            });

            const commands: CommandConfig[] = Array.from({ length: 10 }, (_, i) => ({
                command: `echo ${i}`
            }));

            const results = await commandSequencer.executeInBatches(commands, mockExecute);

            expect(results).toHaveLength(10);
        });

        it('should handle batch size larger than command count', async () => {
            const mockExecute = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'echo 2' }
            ];

            const results = await commandSequencer.executeInBatches(commands, mockExecute, 10);

            expect(results).toHaveLength(2);
        });

        it('should propagate errors in batches', async () => {
            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'result1', stderr: '', code: 0, duration: 100 })
                .mockRejectedValueOnce(new Error('Batch error'))
                .mockResolvedValueOnce({ stdout: 'result3', stderr: '', code: 0, duration: 100 });

            const commands: CommandConfig[] = [
                { command: 'echo 1' },
                { command: 'failing' },
                { command: 'echo 3' }
            ];

            const results = await commandSequencer.executeInBatches(commands, mockExecute, 2);

            expect(results).toHaveLength(3);
            expect(results[0].code).toBe(0);
            expect(results[1].code).toBe(1);
            expect(results[2].code).toBe(0);
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle parallel prerequisite checks', async () => {
            const mockExecute = jest.fn(async (command: string): Promise<CommandResult> => {
                await delay(Math.random() * 100);
                return {
                    stdout: command.includes('--version') ? '1.0.0' : '/usr/bin/tool',
                    stderr: '',
                    code: 0,
                    duration: 100
                };
            });

            const commands: CommandConfig[] = [
                { command: 'node --version', name: 'Node version check' },
                { command: 'npm --version', name: 'NPM version check' },
                { command: 'git --version', name: 'Git version check' },
                { command: 'which aio', name: 'Adobe CLI check' }
            ];

            const results = await commandSequencer.executeParallel(commands, mockExecute);

            expect(results).toHaveLength(4);
            expect(results.every(r => r.code === 0)).toBe(true);
        });

        it('should handle sequential Adobe CLI configuration', async () => {
            const executionLog: string[] = [];

            const mockExecute = jest.fn(async (command: string): Promise<CommandResult> => {
                executionLog.push(command);
                await delay(50);
                return {
                    stdout: 'configured',
                    stderr: '',
                    code: 0,
                    duration: 50
                };
            });

            const commands: CommandConfig[] = [
                { command: 'aio console:org:select ORG1' },
                { command: 'aio console:project:select PROJ1' },
                { command: 'aio console:workspace:select WS1' }
            ];

            await commandSequencer.executeSequence(commands, mockExecute);

            expect(executionLog).toEqual([
                'aio console:org:select ORG1',
                'aio console:project:select PROJ1',
                'aio console:workspace:select WS1'
            ]);
        });
    });
});

// Helper function for delays in tests
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
