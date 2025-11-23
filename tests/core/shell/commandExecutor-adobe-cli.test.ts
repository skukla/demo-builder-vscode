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

describe('CommandExecutor - Adobe CLI Integration', () => {
    let commandExecutor: CommandExecutor;
    let mockDependencies: ReturnType<typeof setupMockDependencies>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations BEFORE creating instances
        mockDependencies = setupMockDependencies();

        // Now create CommandExecutor - it will use our mocks
        commandExecutor = new CommandExecutor();
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

            // Use non-version command to test telemetry configuration
            const promise = commandExecutor.execute('aio console:org:list', {
                configureTelemetry: true
            });

            // Use nextTick to emit events after promise creation
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('org list output\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            expect(mockDependencies.mockEnvironmentSetup().ensureAdobeCLIConfigured).toHaveBeenCalled();
        });

        it('should skip telemetry configuration for --version commands', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('aio --version');

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('9.4.0\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            // Should NOT call telemetry configuration for version checks
            expect(mockDependencies.mockEnvironmentSetup().ensureAdobeCLIConfigured).not.toHaveBeenCalled();
        });

        it('should skip telemetry configuration for -v commands', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('aio -v');

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('9.4.0\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            expect(mockDependencies.mockEnvironmentSetup().ensureAdobeCLIConfigured).not.toHaveBeenCalled();
        });

        it('should skip telemetry for node --version commands', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('node --version');

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('v20.11.0\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            // node commands shouldn't trigger Adobe CLI telemetry
            expect(mockDependencies.mockEnvironmentSetup().ensureAdobeCLIConfigured).not.toHaveBeenCalled();
        });

        it('should skip telemetry when configureTelemetry is explicitly false', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('aio console:org:list', {
                configureTelemetry: false
            });

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('org data\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            expect(mockDependencies.mockEnvironmentSetup().ensureAdobeCLIConfigured).not.toHaveBeenCalled();
        });
    });

    describe('Adobe CLI caching', () => {
        it('should cache aio --version results', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            // First call
            const promise1 = commandExecutor.execute('aio --version');

            // Use nextTick to emit events
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('9.4.0\n'));
                mockChild.emit('close', 0);
            });

            await promise1;

            // Second call should use cache
            const result2 = await commandExecutor.execute('aio --version');

            expect(result2.stdout).toBe('9.4.0\n');
            // spawn should only be called once (cached second time)
            expect(spawn).toHaveBeenCalledTimes(1);
        });

        it('should cache aio plugins results', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            // First call
            const promise1 = commandExecutor.execute('aio plugins');

            // Use nextTick to emit events
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('plugin list\n'));
                mockChild.emit('close', 0);
            });

            await promise1;

            // Second call should use cache
            const result2 = await commandExecutor.execute('aio plugins');

            expect(result2.stdout).toBe('plugin list\n');
            expect(spawn).toHaveBeenCalledTimes(1);
        });

        it('should cache separately for different Node versions (Node 20 vs Node 24)', async () => {
            // Setup mock fnm path
            mockDependencies.mockEnvironmentSetup().findFnmPath.mockReturnValue('/usr/local/bin/fnm');

            const mockChild1 = createMockChildProcess();
            const mockChild2 = createMockChildProcess();

            // First call with Node 20
            (spawn as jest.Mock).mockReturnValueOnce(mockChild1);
            const promise1 = commandExecutor.execute('aio --version', { useNodeVersion: '20' });

            process.nextTick(() => {
                mockChild1.stdout!.emit('data', Buffer.from('@adobe/aio-cli/11.0.0 darwin-arm64 node-v20.19.5\n'));
                mockChild1.emit('close', 0);
            });

            const result1 = await promise1;

            // Second call with Node 24 - should NOT use cache from Node 20
            (spawn as jest.Mock).mockReturnValueOnce(mockChild2);
            const promise2 = commandExecutor.execute('aio --version', { useNodeVersion: '24' });

            process.nextTick(() => {
                mockChild2.stdout!.emit('data', Buffer.from('@adobe/aio-cli/10.3.3 darwin-arm64 node-v24.11.1\n'));
                mockChild2.emit('close', 0);
            });

            const result2 = await promise2;

            // Both calls should have executed (not cached across different Node versions)
            expect(spawn).toHaveBeenCalledTimes(2);
            expect(result1.stdout).toBe('@adobe/aio-cli/11.0.0 darwin-arm64 node-v20.19.5\n');
            expect(result2.stdout).toBe('@adobe/aio-cli/10.3.3 darwin-arm64 node-v24.11.1\n');
        });

        it('should use cache for same Node version (Node 20 twice)', async () => {
            // Setup mock fnm path
            mockDependencies.mockEnvironmentSetup().findFnmPath.mockReturnValue('/usr/local/bin/fnm');

            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            // First call with Node 20
            const promise1 = commandExecutor.execute('aio --version', { useNodeVersion: '20' });

            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('@adobe/aio-cli/11.0.0 darwin-arm64 node-v20.19.5\n'));
                mockChild.emit('close', 0);
            });

            await promise1;

            // Second call with Node 20 again - should use cache
            const result2 = await commandExecutor.execute('aio --version', { useNodeVersion: '20' });

            // Should only execute once (second call uses cache)
            expect(spawn).toHaveBeenCalledTimes(1);
            expect(result2.stdout).toBe('@adobe/aio-cli/11.0.0 darwin-arm64 node-v20.19.5\n');
        });

        it('should NOT cache across default and specified Node versions', async () => {
            // Setup mock fnm path
            mockDependencies.mockEnvironmentSetup().findFnmPath.mockReturnValue('/usr/local/bin/fnm');

            const mockChild1 = createMockChildProcess();
            const mockChild2 = createMockChildProcess();

            // First call without Node version (default)
            (spawn as jest.Mock).mockReturnValueOnce(mockChild1);
            const promise1 = commandExecutor.execute('aio --version');

            process.nextTick(() => {
                mockChild1.stdout!.emit('data', Buffer.from('@adobe/aio-cli/9.4.0\n'));
                mockChild1.emit('close', 0);
            });

            await promise1;

            // Second call with explicit Node version - should NOT use cache
            (spawn as jest.Mock).mockReturnValueOnce(mockChild2);
            const promise2 = commandExecutor.execute('aio --version', { useNodeVersion: '20' });

            process.nextTick(() => {
                mockChild2.stdout!.emit('data', Buffer.from('@adobe/aio-cli/11.0.0 darwin-arm64 node-v20.19.5\n'));
                mockChild2.emit('close', 0);
            });

            await promise2;

            // Both should execute (different cache keys)
            expect(spawn).toHaveBeenCalledTimes(2);
        });

        it('should cache separately for aio plugins with different Node versions', async () => {
            // Setup mock fnm path
            mockDependencies.mockEnvironmentSetup().findFnmPath.mockReturnValue('/usr/local/bin/fnm');

            const mockChild1 = createMockChildProcess();
            const mockChild2 = createMockChildProcess();

            // First call with Node 20
            (spawn as jest.Mock).mockReturnValueOnce(mockChild1);
            const promise1 = commandExecutor.execute('aio plugins', { useNodeVersion: '20' });

            process.nextTick(() => {
                mockChild1.stdout!.emit('data', Buffer.from('@adobe/aio-cli-plugin-api-mesh 3.0.0\n'));
                mockChild1.emit('close', 0);
            });

            await promise1;

            // Second call with Node 24 - should NOT use cache
            (spawn as jest.Mock).mockReturnValueOnce(mockChild2);
            const promise2 = commandExecutor.execute('aio plugins', { useNodeVersion: '24' });

            process.nextTick(() => {
                mockChild2.stdout!.emit('data', Buffer.from('@adobe/aio-cli-plugin-api-mesh 2.5.0\n'));
                mockChild2.emit('close', 0);
            });

            await promise2;

            // Both should execute (different Node versions)
            expect(spawn).toHaveBeenCalledTimes(2);
        });
    });

    describe('Adobe CLI Node version management', () => {
        it('should ensure Adobe CLI Node version is set', async () => {
            const mockChild = createMockChildProcess();
            (spawn as jest.Mock).mockReturnValue(mockChild);

            const promise = commandExecutor.execute('aio console:org:list');

            // Use nextTick to emit events
            process.nextTick(() => {
                mockChild.stdout!.emit('data', Buffer.from('org list\n'));
                mockChild.emit('close', 0);
            });

            await promise;

            expect(mockDependencies.mockEnvironmentSetup().ensureAdobeCLINodeVersion).toHaveBeenCalled();
        });
    });
});
